**Adversarial Findings**

1. **No XR accessibility contract exists, despite claiming “native accessibility.”**  
   Scenario: a WebXR VR menu floats 5 m away; the user interacts with controller rays, hand tracking, gaze, or switch scanning. The hidden `<button>` described in [uikit-native-a11y.md](/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork/planning/superpowers/specs/uikit-native-a11y.md:11) has no meaningful spatial relation to the headset scene, and normal `document.activeElement` is not the user’s in-world focus model.  
   Change: split the spec into explicit modes: `screen/canvas DOM a11y`, `projected 2D canvas a11y`, `diegetic 3D a11y`, and `immersive XR a11y`. Mark the current DOM-shadow design as screen-space-first only. Add a first-class spatial accessibility layer with semantic scene nodes, spatial focus, input adapters, and output channels.

2. **Deferred projection is not a nice-to-have; it is the difference between accessible and fake-accessible for visual/spatial UIs.**  
   Scenario: a low-vision mobile screen-reader user touch-explores the canvas, or a voice-control user says “click settings” while the visible button is rendered in the center of the canvas. The DOM element is at `left:-1000vw`, so AT cannot map the target to what is visible. The spec explicitly defers projection at [line 262](/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork/planning/superpowers/specs/uikit-native-a11y.md:262).  
   Change: make projection required for non-XR screen/canvas mode, with a documented fallback only when projection cannot be configured. The required API should accept camera, renderer/canvas, root, viewport, clipping/frustum state, and per-frame layout updates.

3. **The design treats DOM focus as universal; immersive XR does not.**  
   Scenario: inside an immersive `XRSession`, the user points a controller at a wall terminal. No native DOM focus event occurs, no hidden button receives keyboard activation, and an off-screen aria-live region may not be perceivable in-headset.  
   Change: add an XR focus manager independent of `document.activeElement`: controller ray focus, gaze dwell, hand-pinch, keyboard/gamepad/switch scanning, focus enter/exit events, and modality metadata. The DOM focus bridge can mirror spatial focus when available, but must not be the source of truth.

4. **`dom-overlay` is not addressed, and it is not a solution for diegetic UI.**  
   Scenario: in AR, a browser supports WebXR DOM Overlay for a 2D HUD, but the uikit panel is a 3D object attached to a real-world wall. DOM Overlay can expose conventional DOM overlay controls, but not automatically describe or focus the 3D mesh UI.  
   Change: add a section distinguishing DOM Overlay UI from in-scene uikit UI. Use WebXR DOM Overlay only for true overlay fallback/companion controls, not as the accessibility model for spatial panels. Reference the WebXR DOM Overlays module explicitly.

5. **Linear tab order is incoherent for world-space UI.**  
   Scenario: three panels exist in construction order A, B, C, but the user sees C closest, A behind them, and B occluded by geometry. Tabbing through hidden DOM in mount order, as accepted at [line 277](/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork/planning/superpowers/specs/uikit-native-a11y.md:277), can move focus to invisible or unreachable controls.  
   Change: require authorable and computed spatial navigation: `a11yOrder`, groups/landmarks, panel priority, frustum filtering, occlusion policy, and directional navigation based on camera-relative positions. Construction order is acceptable only for flat screen-space layouts.

6. **Visibility sync is too naive for 3D.**  
   Scenario: `component.isVisible` is true, but the panel is behind the camera, clipped by near/far planes, facing away, too small due to distance, or hidden behind another mesh. The DOM element remains in the a11y tree because [line 91](/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork/planning/superpowers/specs/uikit-native-a11y.md:91) only mirrors component visibility.  
   Change: define `a11yVisibility` separately from render visibility: visible, perceivable, focusable, occluded, offscreen, behind-user, disabled-by-distance. Add hooks for apps to provide occlusion/reachability decisions.

7. **Visual focus rings are insufficient and can create silent focus traps.**  
   Scenario: focus lands on a button behind the user. The `focus={{}}` conditional lights up, but the user cannot see it. This is especially bad for screen-reader, blind, low-vision, and seated VR users.  
   Change: add focus-reveal policy: skip offscreen controls by default, optionally orient panel toward user, move focus to nearest visible control, play spatial audio/haptic cues, or announce “Settings panel behind you.” Camera-follow and auto-orient should be opt-in because they can cause discomfort.

8. **Synthetic `'click'` collapses distinct input modalities into a mouse-like event.**  
   Scenario: a slider or button handler depends on ray intersection point, controller handedness, pointer capture, drag start, or distance. The synthetic event uses a center point and `distance: 0` per [lines 117-124](/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork/planning/superpowers/specs/uikit-native-a11y.md:117), so the existing handler chain may run with misleading geometry.  
   Change: introduce a semantic activation API separate from pointer click: `component.activate({ source: 'keyboard' | 'screenReader' | 'xr-controller' | 'gaze' | 'switch', ... })`. Pointer handlers can delegate to activation, not the other way around.

9. **The announcer is DOM-screen-reader-only, not an XR feedback system.**  
   Scenario: a blind VR user toggles a control through controller input. An off-screen aria-live singleton at [lines 131-142](/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork/planning/superpowers/specs/uikit-native-a11y.md:131) may not be exposed in the headset experience.  
   Change: define an announcement backend interface: DOM aria-live for browser mode, in-world captions, spatial audio/earcons via Web Audio, controller haptics, and optional speech synthesis. Include user preferences for captions, mono audio, reduced motion, and non-spatial fallback.

10. **The role schema imports WAI-ARIA semantics but not spatial semantics.**  
   Scenario: a wall terminal has buttons, status text, and a warning light. ARIA can say “button” and “checked,” but not “mounted on north wall,” “2 meters ahead,” “currently occluded,” “reachable by left controller,” or “part of the cockpit panel.”  
   Change: add spatial metadata: `a11ySpatialLabel`, `a11yLandmark`, `a11yPositionDescription`, `a11yReachable`, `a11yPanelId`, `a11yGroup`, and query/details APIs. WAI-ARIA remains useful, but it is not enough for immersive navigation.

11. **The spec does not reference the relevant XR accessibility requirements.**  
   Scenario: implementation ships after passing VoiceOver keyboard tests, but misses motion-agnostic operation, alternative input mapping, spatial orientation, captions, and spatial audio alternatives. Those are central in W3C’s XR Accessibility User Requirements.  
   Change: add a standards section covering W3C XAUR, WebXR Device API, WebXR DOM Overlay, Game Accessibility Guidelines, and a short survey of Unity/Meta/Babylon/A-Frame approaches. Use XAUR as the checklist for spatial/XR scope, not `@react-three/a11y`.

12. **The test plan proves DOM plumbing, not spatial accessibility.**  
   Scenario: happy-dom tests pass, VoiceOver tabs through buttons, but Quest/visionOS users cannot discover, focus, or activate an in-world panel. The current tests at [lines 264-272](/Users/tjw/Developer/three-flatland/.claude/worktrees/uikit-fork/planning/superpowers/specs/uikit-native-a11y.md:264) never exercise camera movement, occlusion, XR input, projected hit regions, or headset feedback.  
   Change: add acceptance matrices for desktop SR, mobile touch exploration, keyboard-only canvas, voice control, switch scanning, WebXR controller/gaze/hand input, moving camera, panels behind/occluded/scaled/rotated, and AR DOM Overlay fallback.

**What To Preserve**

The core DOM-shadow design is still valuable for conventional browser/canvas accessibility: lazy per-component native elements, reactive ARIA sync, reuse of existing handler chains, `hasFocus` driving existing visual conditionals, accessible-name warnings, and the single listbox strategy for virtualized grids are all sound.

Preserve it as the **screen-space foundation**, but stop presenting it as the whole native accessibility answer for uikit. The production-ready shape is DOM a11y plus a parallel spatial/XR a11y layer, with explicit mode boundaries and tests for each.

References used: [W3C XR Accessibility User Requirements](https://www.w3.org/TR/xaur/), [WebXR DOM Overlays Module](https://immersive-web.github.io/dom-overlays/), [MDN WebXR fundamentals](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Fundamentals).