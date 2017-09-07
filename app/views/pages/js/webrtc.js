const currentUser = document.getElementById("currentUser").innerHTML;
const selfView = document.getElementById("selfView");
const remoteViewContainer = document.getElementById("remoteViewContainer");
const configuration = { iceServers: [{ url: "stun:stun.l.google.com:19302" }] };

window.onload = () => {
  initialize();
};

const initialize = () => {
  console.log("initializing");
};

const handleJoinSession = async () => {
  App.session = await App.cable.subscriptions.create("SessionChannel", {
    connected: () => {
      broadcastData({ type: "initiateConnection" });
    },
    received: data => {
      console.log("RECEIVED:", data);
    }
  });
};

const broadcastData = data => {
  $.ajax({
    url: "sessions",
    type: "post",
    data,
    success: () => {},
    error: () => {}
  });
};
