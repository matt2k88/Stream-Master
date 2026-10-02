import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getApiUrl } from "./api-url";
import { isLifetimeRoute } from "../../shared/lifetime-api";

interface Session {
  ticket: string;
  expiresAt: number;
  sessionExpiresAt: number;
  username: string;
}

const STORAGE_KEY = "ultracast_lifetime_session";
let current: Session | null = null;
let loaded = false;
let generation = 0;
let refreshing: Promise<Session> | null = null;
let storageQueue: Promise<void> = Promise.resolve();
const invalidated = new Set<() => void>();

class LifetimeAuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function onLifetimeSessionInvalidated(listener: () => void) {
  invalidated.add(listener);
  return () => { invalidated.delete(listener); };
}

export function getLifetimeSessionGeneration() { return generation; }

function queueStorage(operation: () => Promise<void>): Promise<void> {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.catch(() => {});
  return result;
}

function invalidateSession() {
  generation++;
  current = null;
  loaded = true;
  void queueStorage(eraseStored).catch(() => {});
  for (const listener of invalidated) listener();
}

// Split the encrypted bearer ticket so native secure storage never receives a
// value larger than its platform limit. Raw Supabase tokens never reach here.
async function readStored(): Promise<Session | null> {
  if (Platform.OS === "web") {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  }
  const value = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!value) return null;
  const { count, storageId, ...metadata } = JSON.parse(value);
  if (!Number.isInteger(count) || count < 1 || count > 12 || typeof storageId !== "string") return null;
  const parts = await Promise.all(Array.from({ length: count }, (_, i) =>
    SecureStore.getItemAsync(`${STORAGE_KEY}_${storageId}_${i}`)));
  if (parts.some(part => part === null)) return null;
  return { ...metadata, ticket: parts.join("") };
}

async function eraseStored() {
  if (Platform.OS === "web") return AsyncStorage.removeItem(STORAGE_KEY);
  const value = await SecureStore.getItemAsync(STORAGE_KEY);
  // Remove the pointer first: a partly deleted session must not be restored.
  await SecureStore.deleteItemAsync(STORAGE_KEY);
  if (value) {
    try {
      const { count, storageId } = JSON.parse(value);
      if (Number.isInteger(count) && count > 0 && count <= 12 && typeof storageId === "string") {
        await Promise.all(Array.from({ length: count }, (_, i) =>
          SecureStore.deleteItemAsync(`${STORAGE_KEY}_${storageId}_${i}`)));
      }
    } catch { /* A malformed pointer is already removed. */ }
  }
}

async function store(session: Session) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return;
  }
  const old = await SecureStore.getItemAsync(STORAGE_KEY);
  const storageId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parts = session.ticket.match(/.{1,1800}/g) ?? [];
  await Promise.all(parts.map((part, i) => SecureStore.setItemAsync(`${STORAGE_KEY}_${storageId}_${i}`, part)));
  const { ticket: _ticket, ...metadata } = session;
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ ...metadata, storageId, count: parts.length }));
  if (old) {
    try {
      const previous = JSON.parse(old);
      if (Number.isInteger(previous.count) && previous.count > 0 && previous.count <= 12 &&
          typeof previous.storageId === "string") {
        await Promise.all(Array.from({ length: previous.count }, (_, i) =>
          SecureStore.deleteItemAsync(`${STORAGE_KEY}_${previous.storageId}_${i}`)));
      }
    } catch { /* The new, complete pointer is already saved. */ }
  }
}

async function authRequest(action: string, ticket?: string, body?: unknown): Promise<Session> {
  const response = await fetch(new URL(`/api/lifetime-auth/${action}`, getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ticket ? { Authorization: `Bearer ${ticket}` } : {}) },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new LifetimeAuthError(data?.error ?? `Lifetime sign-in failed (${response.status})`, response.status);
  if (typeof data?.ticket !== "string" || !data.ticket.startsWith("uc1.") ||
      typeof data.username !== "string" || !Number.isFinite(data.expiresAt) ||
      !Number.isFinite(data.sessionExpiresAt)) {
    throw new Error("The server did not return a valid Lifetime session");
  }
  return data;
}

async function getSession(): Promise<Session> {
  if (!loaded) {
    current = await readStored();
    loaded = true;
  }
  if (!current || current.sessionExpiresAt <= Date.now()) {
    throw new LifetimeAuthError("Please sign in again to use Lifetime features", 401);
  }
  return current;
}

export async function loginLifetime(username: string, password: string) {
  const version = ++generation;
  refreshing = null;
  const session = await authRequest("login", undefined, { username, password });
  if (session.username !== username) throw new Error("Lifetime login returned a different account");
  if (version !== generation) throw new Error("Sign-in was cancelled");
  await queueStorage(async () => {
    if (version !== generation) throw new Error("Sign-in was cancelled");
    await store(session);
  });
  if (version !== generation) throw new Error("Sign-in was cancelled");
  current = session;
  loaded = true;
}

async function refreshSession(): Promise<Session> {
  if (refreshing) return refreshing;
  const version = generation;
  const pending = (async () => {
    const old = await getSession();
    const next = await authRequest("refresh", old.ticket);
    if (next.username !== old.username || version !== generation) throw new Error("Lifetime session changed");
    await queueStorage(async () => {
      if (version !== generation) throw new Error("Lifetime session changed");
      await store(next);
    });
    if (version !== generation) throw new Error("Lifetime session changed");
    current = next;
    return next;
  })();
  refreshing = pending;
  try { return await pending; } finally { if (refreshing === pending) refreshing = null; }
}

/** Restore an existing session; migrate older installs using saved login once. */
export async function restoreLifetime(username: string, password: string) {
  if (!loaded) { current = await readStored(); loaded = true; }
  if (!current || current.username !== username || current.sessionExpiresAt <= Date.now()) {
    await loginLifetime(username, password);
  } else if (current.expiresAt <= Date.now() + 60_000) {
    await refreshSession();
  }
}

export async function logoutLifetime() {
  const old = current;
  generation++;
  current = null;
  loaded = true;
  refreshing = null;
  await queueStorage(eraseStored);
  if (old) {
    const response = await fetch(new URL("/api/lifetime-auth/logout", getApiUrl()).toString(), {
      method: "POST", headers: { Authorization: `Bearer ${old.ticket}` }, cache: "no-store",
    });
    if (!response.ok && response.status !== 401) throw new Error("Signed out locally; server session revocation failed");
  }
}

/** Only attach the private ticket to protected routes on OUR configured API. */
export async function lifetimeApiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, getApiUrl());
  if (url.origin !== new URL(getApiUrl()).origin || !isLifetimeRoute(url.pathname)) return fetch(input, init);
  const requestGeneration = generation;
  try {
  let session = await getSession();
  if (session.expiresAt <= Date.now() + 60_000) session = await refreshSession();
  const send = async (ticket: string) => {
    if (requestGeneration !== generation) throw new Error("The signed-in account changed");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${ticket}`);
    const result = await fetch(url.toString(), { ...init, headers, cache: "no-store" });
    if (requestGeneration !== generation) throw new Error("The signed-in account changed");
    return result;
  };
  const response = await send(session.ticket);
  if (response.status !== 401) return response;
  // A concurrent request might already have rotated the session.
  const latest = await getSession();
  const renewed = latest.ticket !== session.ticket ? latest : await refreshSession();
  const retry = await send(renewed.ticket);
  if (retry.status === 401) invalidateSession();
  return retry;
  } catch (error) {
    if (requestGeneration === generation && error instanceof LifetimeAuthError && error.status === 401) invalidateSession();
    throw error;
  }
}