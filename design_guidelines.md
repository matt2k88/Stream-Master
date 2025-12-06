# IPTV Player Design Guidelines

## Architecture Decisions

### Authentication
**Required**: Xtream Codes API authentication
- Login screen with three input fields:
  - Server URL (text input with keyboard type: url)
  - Username (text input)
  - Password (secure text input)
- Store credentials securely using Expo SecureStore
- Include "Remember Me" toggle to persist login
- Show loading indicator during API validation
- Display clear error messages for failed authentication
- No SSO needed - direct API authentication only

### Navigation
**Stack-Only Navigation** (no tab bar)
- Linear flow optimized for TV/remote control navigation:
  1. Login Screen → Home Screen
  2. Home Screen → Category Screen (Live TV/Movies/Series)
  3. Category Screen → Content List
  4. Content List → Player Screen
- Small "Account Info" button in top-right corner of Home Screen opens modal overlay
- Back navigation should be intuitive with Android TV remote back button

### Screen Specifications

#### 1. Login Screen
- **Purpose**: Authenticate user with Xtream Codes API
- **Layout**:
  - Centered vertical form layout
  - Header: App logo/title (if applicable)
  - Three input fields stacked vertically with generous spacing
  - "Login" button below form (full-width or centered)
  - Error message area below button
- **Orientation**: Landscape locked
- **Components**: TextInput x3, TouchableOpacity button, loading spinner
- **Safe Area**: Apply horizontal insets for 16:9 TV displays

#### 2. Home Screen
- **Purpose**: Navigate to main content categories
- **Layout**:
  - Three large equal-width boxes arranged horizontally
  - Each box displays icon + category name
  - Small circular "Account Info" button in top-right (48x48dp)
  - Optional app logo in top-left
- **Box Layout**:
  - Live TV (left) - TV icon
  - Movies (center) - Film icon
  - Series (right) - Series/episodes icon
- **Safe Area**: Horizontal and vertical insets for TV overscan (minimum 48dp all sides)
- **Components**: Three large TouchableOpacity cards, icon button for account

#### 3. Category Screen (Live TV/Movies/Series)
- **Purpose**: Browse content within selected category
- **Layout**:
  - Header: Category title on left, back button on right
  - Grid of category folders/channels
  - FlatList with 3-4 columns for easy TV navigation
- **Components**: FlatList, category cards with cover images and titles
- **Safe Area**: Top 72dp (header + spacing), bottom 48dp

#### 4. Content List Screen
- **Purpose**: Display streams/content items in selected category
- **Layout**:
  - Header: Category name, back button
  - Vertical list of content items with:
    - Thumbnail/poster image (left)
    - Title and metadata (right)
    - Focus highlight for TV remote navigation
- **Components**: FlatList, content cards
- **Safe Area**: Top 72dp, bottom 48dp

#### 5. Player Screen
- **Purpose**: Play selected stream
- **Layout**:
  - Full-screen video player
  - Controls overlay (auto-hide after 3s):
    - Play/pause (center)
    - Back button (top-left)
    - Title overlay (top-center)
    - Optional progress bar (bottom)
- **Orientation**: Landscape locked
- **Components**: Video player, overlay controls
- **Safe Area**: None (full-screen), but controls should respect TV-safe zones

#### 6. Account Info Modal
- **Purpose**: Display user subscription details from API
- **Layout**:
  - Semi-transparent dark overlay (80% opacity)
  - White/light card centered (max-width 600dp)
  - Close button (X) in top-right of card
  - User info from API:
    - Username
    - Subscription status
    - Expiration date
    - Active connections
  - "Logout" button at bottom
- **Components**: Modal overlay, info fields, logout button

## Design System

### Color Palette
- **Primary**: Dark background (#0A0E27) for TV viewing comfort
- **Secondary**: Accent blue (#2196F3) for focused/selected items
- **Surface**: Dark gray cards (#1A1F36)
- **Text**: White (#FFFFFF) primary, light gray (#B0B3C1) secondary
- **Error**: Red (#F44336)
- **Success**: Green (#4CAF50)

### Typography
- **Large Headings**: 32-36sp (TV-optimized for distance viewing)
- **Category Titles**: 24-28sp
- **Body Text**: 18-20sp (larger than mobile for TV readability)
- **Buttons**: 20sp, uppercase, bold
- **Font Family**: System default (Roboto on Android)

### Visual Design

**TV-Optimized Focus States**:
- All touchable elements MUST have clear focus indicators for TV remote navigation
- Focused item: 4dp border in accent color (#2196F3), scale up 1.05x
- Unfocused: Subtle border in gray (#3A3F56)
- Use drop shadows for elevated cards:
  - shadowOffset: {width: 0, height: 8}
  - shadowOpacity: 0.3
  - shadowRadius: 12

**Category Boxes (Home Screen)**:
- Size: Minimum 300x200dp each
- Border radius: 12dp
- Background: Dark gradient or solid dark surface
- Icon size: 72x72dp, centered above text
- Generous padding: 24dp all sides
- Hover/Focus: Scale 1.08x, brightness increase, accent border

**Content Cards**:
- Grid items: 16:9 aspect ratio thumbnails
- Border radius: 8dp
- Title overlay or below image
- Focus state: Accent border + slight elevation

**Player Controls**:
- Large touch targets: Minimum 64x64dp
- Semi-transparent dark background for overlay
- White icons with 80% opacity, 100% when focused

### Interaction Design
- **D-pad/Remote Navigation**: All interactive elements must be navigable with TV remote
- **Focus Order**: Logical left-to-right, top-to-bottom
- **Back Button**: Should navigate to previous screen
- **Loading States**: Show spinner for API calls, skeleton screens for content loading
- **Error Handling**: Toast messages or centered error cards with retry button

### Assets Required
- **Icons**: Feather or Material Icons for:
  - TV/Live (live TV category)
  - Film (movies category)  
  - Monitor/Grid (series category)
  - User/Account (account button)
  - Play, Pause, Back, Close (X)
- **Placeholders**: Dark gray placeholder images for missing thumbnails/posters

### Accessibility
- **Large Touch Targets**: Minimum 48x48dp (TV: 64x64dp recommended)
- **Focus Indicators**: Always visible and high-contrast
- **Keyboard/Remote Navigation**: Fully navigable without touch
- **Text Contrast**: WCAG AA compliant (4.5:1 minimum for body text)
- **Loading Indicators**: Visible feedback for all async operations

### TV-Specific Considerations
- **Overscan Safe Zone**: Keep critical UI elements 48dp+ from screen edges
- **Large Text**: All text 18sp minimum for 10-foot viewing distance
- **Generous Spacing**: Minimum 16dp between interactive elements
- **No Hover States**: Focus-only (no mouse hover on TV)
- **Landscape Lock**: All screens forced to landscape orientation
- **Performance**: Smooth 60fps scrolling, optimized images, lazy loading for large lists