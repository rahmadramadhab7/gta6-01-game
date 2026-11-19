// Keyboard and pointer input. Held keys give a movement direction; one-shot presses
// (pause, mute) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice.

export const ACTION_PAUSE = 1;
export const ACTION_MUTE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MISSION = 8;
export const ACTION_RESTART = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let dragYaw = 0;
  let dragPitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function keyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    if (event.code === 'KeyJ') actions |= ACTION_MISSION;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
  }
  function keyUp(event) {
    keys.delete(event.code);
  }
  function pointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!dragging) return;
    dragYaw -= (event.clientX - lastX) * 0.005;
    dragPitch += (event.clientY - lastY) * 0.004;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function pointerUp() {
    dragging = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);

  return {
    /** Camera-relative movement from the currently held keys. */
    direction() {
      return {
        forward: keys.has('KeyW') || keys.has('ArrowUp'),
        back: keys.has('KeyS') || keys.has('ArrowDown'),
        left: keys.has('KeyA') || keys.has('ArrowLeft'),
        right: keys.has('KeyD') || keys.has('ArrowRight'),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      };
    },
    /** Mouse-drag orbit deltas since the last read, in radians. */
    takeDrag() {
      const out = { yaw: dragYaw, pitch: dragPitch };
      dragYaw = 0;
      dragPitch = 0;
      return out;
    },
    /** One-shot actions since the last read. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
  };
}
