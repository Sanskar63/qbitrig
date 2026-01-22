# Smooth Movement Fix - Why Snapping Was Happening

## Root Causes Identified

### 1. **Server Update Rate vs Client Render Rate Mismatch**
- **Server**: Updates at 20Hz (every 50ms)
- **Client**: Renders at 60fps (every ~16ms)
- **Problem**: Server processes multiple inputs in one tick, causing position to "jump" ahead
- **Result**: When server state arrives, client position is far behind, triggering snap correction

### 2. **Aggressive Snap Threshold**
- **Previous**: Snapped if desync > 50px
- **Problem**: 50px is relatively small - normal network latency can cause this
- **Result**: Player would snap/jump when server updates arrived

### 3. **No Velocity Interpolation on Server**
- **Previous**: Server directly set `velX = dx * speed`
- **Problem**: Instant velocity changes cause jerky movement
- **Result**: Server position updates were not smooth

### 4. **Input Buffering Issues**
- **Problem**: Server processes buffered inputs which can accumulate
- **Result**: Multiple inputs processed at once = large position jumps

## Fixes Applied

### 1. **Increased Snap Threshold**
- Changed from 50px to 200px
- Only snap for extreme desyncs (network issues, lag spikes)
- Even then, use smooth interpolation instead of instant snap

### 2. **Smooth Interpolation Always**
- Never instant snap (except for extreme cases > 200px)
- Use distance-based lerp factors:
  - Small desync (10-30px): 0.04 lerp (very gentle)
  - Medium desync (30-200px): 0.05-0.12 lerp (scales with distance)
  - Large desync (>200px): 0.3 lerp (faster but still smooth)

### 3. **Server-Side Velocity Interpolation**
- Added smooth velocity interpolation on server (matches client)
- Prevents server from making jerky position updates

### 4. **Position History Buffer**
- Track last 3 server positions
- Enables future time-based interpolation if needed

### 5. **Gentle Drift When Not Moving**
- When player stops moving, gently drift towards server position
- Prevents accumulation of small desyncs

## Why It Was Snapping

The "leap" behavior happened because:

1. **Client predicts movement** → Player moves locally
2. **Server processes buffered inputs** → Server position jumps ahead (multiple inputs processed)
3. **Server state arrives** → Distance > 50px detected
4. **Client snaps to server position** → Visual "leap"

Now:
1. **Client predicts movement** → Player moves locally
2. **Server processes inputs smoothly** → Server position updates smoothly
3. **Server state arrives** → Distance checked
4. **Client smoothly interpolates** → No snap, just gentle correction

## Testing

To verify the fix works:
1. Move around in multiplayer
2. Movement should be smooth without sudden jumps
3. If network lag occurs, position should smoothly correct, not snap
4. Trail should remain visible and smooth
