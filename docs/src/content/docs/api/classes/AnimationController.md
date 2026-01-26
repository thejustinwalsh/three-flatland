---
editUrl: false
next: false
prev: false
title: "AnimationController"
---

Defined in: [packages/core/src/animation/AnimationController.ts:27](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L27)

Controls animation playback and state.

## Example

```typescript
const controller = new AnimationController();
controller.addAnimation({
  name: 'walk',
  frames: walkFrames,
  fps: 12,
  loop: true,
});
controller.play('walk');

// In update loop
controller.update(deltaMs, (frame) => {
  sprite.setFrame(frame);
});
```

## Constructors

### Constructor

> **new AnimationController**(): `AnimationController`

#### Returns

`AnimationController`

## Accessors

### currentAnimation

#### Get Signature

> **get** **currentAnimation**(): `string` \| `null`

Defined in: [packages/core/src/animation/AnimationController.ts:286](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L286)

Get current animation name.

##### Returns

`string` \| `null`

## Methods

### addAnimation()

> **addAnimation**(`animation`): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:44](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L44)

Add an animation definition.

#### Parameters

##### animation

[`Animation`](/api/interfaces/animation/)

#### Returns

`this`

***

### addAnimations()

> **addAnimations**(`animations`): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:52](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L52)

Add multiple animations.

#### Parameters

##### animations

[`Animation`](/api/interfaces/animation/)[]

#### Returns

`this`

***

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/animation/AnimationController.ts:323](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L323)

Dispose of resources.

#### Returns

`void`

***

### getAnimation()

> **getAnimation**(`name`): [`Animation`](/api/interfaces/animation/) \| `undefined`

Defined in: [packages/core/src/animation/AnimationController.ts:73](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L73)

Get an animation by name.

#### Parameters

##### name

`string`

#### Returns

[`Animation`](/api/interfaces/animation/) \| `undefined`

***

### getAnimationDuration()

> **getAnimationDuration**(`name`): `number`

Defined in: [packages/core/src/animation/AnimationController.ts:308](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L308)

Get animation duration in milliseconds.

#### Parameters

##### name

`string`

#### Returns

`number`

***

### getAnimationNames()

> **getAnimationNames**(): `string`[]

Defined in: [packages/core/src/animation/AnimationController.ts:80](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L80)

Get all animation names.

#### Returns

`string`[]

***

### getCurrentFrame()

> **getCurrentFrame**(): [`SpriteFrame`](/api/interfaces/spriteframe/) \| `null`

Defined in: [packages/core/src/animation/AnimationController.ts:251](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L251)

Get current frame.

#### Returns

[`SpriteFrame`](/api/interfaces/spriteframe/) \| `null`

***

### getSpeed()

> **getSpeed**(): `number`

Defined in: [packages/core/src/animation/AnimationController.ts:293](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L293)

Get playback speed.

#### Returns

`number`

***

### getState()

> **getState**(): [`AnimationState`](/api/interfaces/animationstate/)

Defined in: [packages/core/src/animation/AnimationController.ts:261](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L261)

Get current animation state.

#### Returns

[`AnimationState`](/api/interfaces/animationstate/)

***

### gotoFrame()

> **gotoFrame**(`index`): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:145](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L145)

Go to a specific frame.

#### Parameters

##### index

`number`

#### Returns

`this`

***

### isPlaying()

> **isPlaying**(`name?`): `boolean`

Defined in: [packages/core/src/animation/AnimationController.ts:276](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L276)

Check if an animation is playing.

#### Parameters

##### name?

`string`

#### Returns

`boolean`

***

### pause()

> **pause**(): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:117](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L117)

Pause the current animation.

#### Returns

`this`

***

### play()

> **play**(`name`, `options`): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:87](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L87)

Play an animation.

#### Parameters

##### name

`string`

##### options

[`PlayOptions`](/api/interfaces/playoptions/) = `{}`

#### Returns

`this`

***

### removeAnimation()

> **removeAnimation**(`name`): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:62](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L62)

Remove an animation.

#### Parameters

##### name

`string`

#### Returns

`this`

***

### resume()

> **resume**(): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:125](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L125)

Resume a paused animation.

#### Returns

`this`

***

### setSpeed()

> **setSpeed**(`speed`): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:300](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L300)

Set playback speed.

#### Parameters

##### speed

`number`

#### Returns

`this`

***

### stop()

> **stop**(): `this`

Defined in: [packages/core/src/animation/AnimationController.ts:133](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L133)

Stop the current animation.

#### Returns

`this`

***

### update()

> **update**(`deltaMs`, `onFrame?`, `onEvent?`): `void`

Defined in: [packages/core/src/animation/AnimationController.ts:159](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/AnimationController.ts#L159)

Update animation state.

#### Parameters

##### deltaMs

`number`

Time since last update in milliseconds

##### onFrame?

`FrameCallback`

Callback when frame changes

##### onEvent?

`EventCallback`

Callback when frame event fires

#### Returns

`void`
