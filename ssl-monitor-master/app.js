let cmd = require('node-cmd');
const Promise = require('bluebird');
cmd = Promise.promisify(cmd.get, { multiArgs: true, context: cmd });
const nodemailer = require('nodemailer');
const Email = require("email-templates");
const Mattermost = require("./mattermost");
const mattermost = new Mattermost("https://mattermost.anomalistdesign.com/hooks/yecfafkmzjgibrpc399kbebe6w");
const schedule = require('node-schedule');

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "",
    pass: "",
  },
});

const send_email = async (email, template, data) => {
  const _email = new Email({
    message: {
      from: '',
    },
    send: true,
    transport: transporter,
    views: {
      options: {
        extension: 'ejs',
      },
    },
    preview: false
  });

  await _email.send({
    template,
    message: {
      to: email,
    },
    locals: {
      data,
    },
  });
  return;
}

const sendCertbotStatusByEmail = (message, logs) => {
  const emails = [
  ];
  for (const i in emails) {
    send_email(emails[i], "/docker-volumes/bluhorse-ssl-monitor/emails/certbot-status", {
      message,
      logs
    });
  }
}

const sendHaproxyStatusByEmail = (message, logs) => {
  const emails = [
  ];
  for (const i in emails) {
    send_email(emails[i], "/docker-volumes/bluhorse-ssl-monitor/emails/haproxy-status", {
      message,
      logs
    });
  }
}

const sendStatusByMattermost = (message, logs) => {
  let text = message + "\n";
  text += "------------------\n"
  for (const i in logs) {
    text += logs[i] + "\n"
  }
  message += "------------------\n"
  mattermost.send({
    text
  }, (res) => { });
}

const setWait = (ms) => {
  return new Promise(
    resolve => {
      setTimeout(
        () => {
          resolve();
        },
        ms
      )
    }
  )
}

const runCertbot = async () => {
  try {
    sendStatusByMattermost("Commencing ssl renewal.", []);
    let logs = await cmd('certbot renew --webroot -w /data/letsencrypt');
    sendStatusByMattermost("ssl renewal complete. see results below:", []);
    await setWait(1000);
    return logs[0].split("\n");
  } catch (err) {
    return ["(failure) " + err.message];
  }
}

const restartHaproxy = async () => {
  try {
    await cmd('docker restart haproxy');
  } catch (err) { }
}

const log = (msg) => {
  console.log(msg);
}

const certbot = async () => {
  log("fetching certbot logs.");
  let certbot_logs = await runCertbot();
  let failure = [];
  let success = [];
  let skipped = [];
  for (const i in certbot_logs) {
    if (certbot_logs[i].includes("(failure)")) {
      failure.push(certbot_logs[i]);
    }
    if (certbot_logs[i].includes("(success)")) {
      success.push(certbot_logs[i]);
    }
    if (certbot_logs[i].includes("(skipped)")) {
      skipped.push(certbot_logs[i]);
    }
  }
  if (failure.length) {
    sendStatusByMattermost("The following certs have failed for renewal", failure);
  }
  if (skipped.length) {
    sendStatusByMattermost("The following certs are not yet up for renewal", skipped);
  }
  if (success.length) {
    sendCertbotStatusByEmail("Bluehorse SSL Certs Renewed.", success);
    sendStatusByMattermost("The following certs have succeed for renewal", success);
    await cmd('cat /etc/letsencrypt/live/bluhorse.net/fullchain.pem /etc/letsencrypt/live/bluhorse.net/privkey.pem | tee /etc/certs/bluhorse.net.pem');
    setWait(5000);
    // sendStatusByMattermost("Commencing Haproxy Restart...", []);
    // haproxy();
  }
}

let haproxyStarted = false;

const haproxy = async () => {
  log("Restarting Haproxy");
  await restartHaproxy();
  log("fetching haproxy logs.");
  let haproxy_logs = await cmd('docker logs haproxy');
  haproxy_logs = haproxy_logs[1].split("\n");
  haproxy_logs = [
    haproxy_logs[haproxy_logs.length - 11],
    haproxy_logs[haproxy_logs.length - 10],
    haproxy_logs[haproxy_logs.length - 9],
    haproxy_logs[haproxy_logs.length - 8],
    haproxy_logs[haproxy_logs.length - 7],
    haproxy_logs[haproxy_logs.length - 6],
    haproxy_logs[haproxy_logs.length - 5],
    haproxy_logs[haproxy_logs.length - 4],
    haproxy_logs[haproxy_logs.length - 3],
    haproxy_logs[haproxy_logs.length - 2],
  ];
  log(haproxy_logs);
  if (haproxy_logs[haproxy_logs.length - 1].includes("New worker")) {
    if (!haproxyStarted) {
      let message = "Bluehorse Haproxy, Succesfully Started";
      log(message);
      log("Sending Haproxy Status by Email.")
      sendHaproxyStatusByEmail(message, haproxy_logs);
      log("Sending Haproxy Status by Mattermost.")
      sendStatusByMattermost(message, haproxy_logs);
      haproxyStarted = true;
    }
  } else {
    haproxyStarted = false;
    let message = "Bluehorse Haproxy, Failed to Start. Commencing restart...";
    restart = true;
    log(message);
    log("Sending Haproxy Status by Email.")
    sendHaproxyStatusByEmail(message, haproxy_logs);
    log("Sending Haproxy Status by Mattermost.")
    sendStatusByMattermost(message, haproxy_logs);
    log("Restarting Haproxy.");
    await restartHaproxy();
    log("Restarting Monitor Process.");
    await haproxy();
  }
}

(async () => {
  certbot();
  schedule.scheduleJob('0 2 * * *', async () => {
    await certbot();
  });
})();