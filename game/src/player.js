// The player's body: acceleration movement with crouch and jump, mouse look
// with recoil on top, and AABB collision. Bots use their own mover in bots.js
// (same collideCircle, simpler steering).
export function createPlayer(world) {
  const body = {
    pos: { x: 0, y: 0, z: 19 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, // facing -z when 0
    pitch: 0,
    eye: 1.62,
    grounded: true,
    crouching: false,
    recoilPitch: 0, // unrecovered kick, decays back to 0
    recoilYaw: 0,
    bobPhase: 0,
    moveSpeed: 0, // horizontal speed, for spread and the viewmodel
  };
  const WALK = 4.4;
  const CROUCH = 1.9;
  const ADS = 2.6;
  const ACCEL = 42;
  const FRICTION = 10;
  const GRAVITY = 15;
  const JUMP = 5.4;
  const RADIUS = 0.35;

  function step(dt, keys, aiming) {
    let max = body.crouching ? CROUCH : aiming ? ADS : WALK;
    // Wish direction in world space from yaw (W = forward = -z rotated).
    let ix = 0;
    let iz = 0;
    if (keys.has('KeyW')) iz -= 1;
    if (keys.has('KeyS')) iz += 1;
    if (keys.has('KeyA')) ix -= 1;
    if (keys.has('KeyD')) ix += 1;
    const len = Math.hypot(ix, iz) || 1;
    ix /= len;
    iz /= len;
    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    const wx = ix * cos - iz * sin;
    const wz = ix * sin + iz * cos;
    if (body.grounded) {
      body.vel.x += wx * ACCEL * dt;
      body.vel.z += wz * ACCEL * dt;
      // Friction when no input: snappy stop, CS-like.
      const f = Math.max(0, 1 - FRICTION * dt * (ix || iz ? 0.25 : 1));
      body.vel.x *= f;
      body.vel.z *= f;
      const sp = Math.hypot(body.vel.x, body.vel.z);
      if (sp > max) {
        body.vel.x = (body.vel.x / sp) * max;
        body.vel.z = (body.vel.z / sp) * max;
      }
      if (keys.has('Space')) {
        body.vel.y = JUMP;
        body.grounded = false;
      }
    }
    body.vel.y -= GRAVITY * dt;
    body.pos.x += body.vel.x * dt;
    body.pos.z += body.vel.z * dt;
    body.pos.y += body.vel.y * dt;
    if (body.pos.y <= 0) {
      body.pos.y = 0;
      body.vel.y = 0;
      body.grounded = true;
    }
    world.collideCircle(body.pos, RADIUS);
    body.moveSpeed = Math.hypot(body.vel.x, body.vel.z);
    body.bobPhase += dt * body.moveSpeed * 1.6;
    // Recoil recovery: the kick decays, the camera settles back down.
    body.recoilPitch *= Math.max(0, 1 - 7 * dt);
    body.recoilYaw *= Math.max(0, 1 - 7 * dt);
    body.crouching = keys.has('ControlLeft') || keys.has('ControlRight');
    const eyeTarget = body.crouching ? 1.15 : 1.62;
    body.eye += (eyeTarget - body.eye) * Math.min(1, 12 * dt);
  }
  function look(dx, dy) {
    body.yaw -= dx * 0.0022;
    body.pitch -= dy * 0.0022;
    body.pitch = Math.max(-1.5, Math.min(1.5, body.pitch));
  }
  function addRecoil(pitch, yaw) {
    body.recoilPitch += pitch;
    body.recoilYaw += yaw;
    body.pitch = Math.max(-1.5, Math.min(1.5, body.pitch + pitch * 0.55));
    body.yaw += yaw * 0.55;
  }
  // Spread the current shot takes: base + movement + air, halved aiming down sights.
  function spreadFor(def, aiming) {
    let s = def.spread + body.moveSpeed * def.moveBloom + (body.grounded ? 0 : 0.02);
    if (body.crouching) s *= 0.7;
    if (aiming) s *= 0.5;
    return s;
  }
  return { body, step, look, addRecoil, spreadFor };
}
