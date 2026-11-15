// Deathcam: when the player dies, the camera eases round to face the killer
// and the HUD names them — so a death teaches you something instead of just
// ending the round. Pure presentation: it only reads sim state, never writes
// it, and resets on the next round. The killer keeps moving, so the camera
// tracks their live position until the round ends; if the killer dies too,
// the view simply holds its last angle.
export function createDeathcam() {
  let killer = null;
  let yaw = 0;
  let pitch = 0;
  let active = false;

  // Shortest-arc turn, so the camera never spins the long way round.
  function turn(cur, want, maxStep) {
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxStep) return want;
    return cur + Math.sign(d) * maxStep;
  }

  return {
    // k: the killer's combatant record (null for a blast death); the camera
    // starts at the player's death angles and eases from there.
    begin(k, startYaw, startPitch) {
      killer = k;
      yaw = startYaw;
      pitch = startPitch;
      active = true;
    },
    reset() {
      killer = null;
      active = false;
    },
    isActive() { return active; },
    // dt: render frame time; victimPos/eyeY: where the dead player lies.
    // Returns the camera angles for this frame.
    update(dt, victimPos, eyeY) {
      if (!active) return null;
      if (killer && killer.alive) {
        const kx = killer.pos.x - victimPos.x;
        const ky = (killer.pos.y + 1.3) - (victimPos.y + eyeY);
        const kz = killer.pos.z - victimPos.z;
        const len = Math.hypot(kx, ky, kz) || 1;
        const wantYaw = Math.atan2(-kx, -kz);
        const wantPitch = Math.asin(Math.max(-1, Math.min(1, ky / len)));
        yaw = turn(yaw, wantYaw, 2.2 * dt);
        pitch += (wantPitch - pitch) * Math.min(1, 3 * dt);
      }
      return { yaw, pitch };
    },
  };
}
