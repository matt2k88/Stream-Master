/**
 * Type augmentation for React Native TV/Android focus-navigation props that
 * are present at runtime but missing from the legacy `react-native/types`
 * declaration files shipped with this version of the package.
 *
 * `nextFocusLeft` / `nextFocusRight` are defined in the JS runtime
 * (ViewPropTypes.js lines 306/313) and in `types_generated/`, but are absent
 * from the `types/` folder that TypeScript resolves by default.
 */

import "react-native";

declare module "react-native" {
  interface ViewProps {
    nextFocusLeft?: number | undefined;
    nextFocusRight?: number | undefined;
  }
}
