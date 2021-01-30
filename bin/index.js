#!/usr/bin/env node

const childProcess = require('child_process');

// Disabled until this issue is resolved: https://github.com/sindresorhus/do-not-disturb/issues/9
// const doNotDisturb = require('do-not-disturb');

const displayNotification = require('display-notification');

/**
 * This will be true if we have muted notifications. It means we have to unmute them at some point.
 */
let muted = false;

/**
 * ID of the wait timeout, so we can interrupt.
 */
let waitId = null;

/**
 * Flag used to synchronize clean exit
 */
let stopSignal = false;

process.once('SIGINT', onExit);
process.once('SIGTERM', onExit);

updateLoop().catch(onFatalError);

// *********************************************************************************************************************

function onFatalError(err) {
  console.error(err);
  process.exit(1);
}

async function exec(cmd) {
  return new Promise((resolve, reject) => {
    childProcess.exec(
      cmd,
      {
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          if (stderr) {
            console.warn(stderr);
          }
          resolve(stdout);
        }
      },
    );
  });
}

async function wait(delay) {
  return new Promise((resolve) => {
    waitId = setTimeout(resolve, delay);
  });
}

async function isZoomMeetingOn() {
  try {
    await exec(
      'ps aux | grep zoom.us.app/Contents/Frameworks/cpthost.app/Contents/MacOS/CptHost | grep -v grep',
    );
  } catch (err) {
    return false;
  }
  return true;
}

async function update() {
  process.stdout.write('.');

  const shouldBeMuted = await isZoomMeetingOn();

  if (!shouldBeMuted && muted) {
    // Unmute
    await exec(`./disable-dnd.sh`);
    // Disabled until this issue is resolved: https://github.com/sindresorhus/do-not-disturb/issues/9
    // await doNotDisturb.disable();
    await displayNotification({
      title: 'Notifications unmuted',
      text:
        'Do-not-disturb mode deactivated, you will receive notifications again.',
    });
    muted = false;
    console.log('\nUnmuted notifications');
    return;
  }

  if (shouldBeMuted && !muted) {
    await displayNotification({
      title: 'Notifications muted',
      text: 'Do-not-disturb mode activated during your Zoom call.',
    });

    // We should mute. But lets check if user has disabled notifications on their own.

    // Disabled until this issue is resolved: https://github.com/sindresorhus/do-not-disturb/issues/9
    // const userAlreadyMuted = await doNotDisturb.isEnabled();
    // if (userAlreadyMuted) {
    //   // Nothing else needs to be done
    //   return;
    // }

    muted = true;
    await exec(`./enable-dnd.sh`);

    // Disabled until this issue is resolved: https://github.com/sindresorhus/do-not-disturb/issues/9
    // await doNotDisturb.enable();

    console.log('\nMuted notifications');
    return;
  }

  // Nothing else needs to be done
}

async function updateLoop() {
  while (!stopSignal) {
    try {
      await update();
    } catch (err) {
      console.error(`Update failed: ${err.message || err}`);
      console.error(err.stack);
    }
    if (stopSignal) {
      break;
    }
    await wait(1000);
  }
  await cleanExit();
}

async function cleanExit() {
  if (muted) {
    await exec(`./disable-dnd.sh`);
    // Disabled until this issue is resolved: https://github.com/sindresorhus/do-not-disturb/issues/9
    // await doNotDisturb.disable();
  }
  process.exit(0);
}

function onExit() {
  stopSignal = true;
  clearTimeout(waitId);
}
