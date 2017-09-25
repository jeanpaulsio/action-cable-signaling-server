// BROADCAST TYPES
const JOIN_ROOM = "JOIN_ROOM";
const EXCHANGE = "EXCHANGE";
const REMOVE_USER = "REMOVE_USER";

// DOM ELEMENTS
const currentUser = document.getElementById("currentUser").innerHTML;
const selfView = document.getElementById("selfView");
const remoteViewContainer = document.getElementById("remoteViewContainer");

// CONFIG
const ice = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const constraints = {
  audio: false,
  video: { width: 240, height: 180 }
};

// GLOBAL OBJECTS
let pcPeers = {};
let localStream;

// Window Events
window.onload = () => {
  initialize();
};

const initialize = () => {
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(stream => {
      localStream = stream;
      selfView.srcObject = stream;
      selfView.muted = true;
    })
    .catch(logError);
};

const handleJoinSession = async () => {
  App.session = await App.cable.subscriptions.create("SessionChannel", {
    connected: () => connectUser(currentUser),
    received: data => {
      console.log("received", data);
      if (data.from === currentUser) return;
      switch (data.type) {
        case JOIN_ROOM:
          return joinRoom(data);
        case EXCHANGE:
          if (data.to !== currentUser) return;
          return exchange(data);
        case REMOVE_USER:
          return removeUser(data);
        default:
          return;
      }
    }
  });
};

const handleLeaveSession = () => {
  for (user in pcPeers) {
    pcPeers[user].close();
  }
  pcPeers = {};

  App.session.unsubscribe();

  remoteViewContainer.innerHTML = "";

  broadcastData({
    type: REMOVE_USER,
    from: currentUser
  });
};

const connectUser = userId => {
  broadcastData({
    type: JOIN_ROOM,
    from: currentUser
  });
};

const joinRoom = data => {
  createPC(data.from, true);
};

const removeUser = data => {
  console.log("removing user", data.from);
  let video = document.getElementById(`remoteView+${data.from}`);
  video && video.remove();
  delete pcPeers[data.from];
};

const createPC = (userId, isOffer) => {
  let pc = new RTCPeerConnection(ice);
  pcPeers[userId] = pc;
  pc.addStream(localStream);

  isOffer &&
    pc
      .createOffer()
      .then(offer => {
        pc.setLocalDescription(offer);
        broadcastData({
          type: EXCHANGE,
          from: currentUser,
          to: userId,
          sdp: JSON.stringify(pc.localDescription)
        });
      })
      .catch(logError);

  pc.onicecandidate = event => {
    event.candidate &&
      broadcastData({
        type: EXCHANGE,
        from: currentUser,
        to: userId,
        candidate: JSON.stringify(event.candidate)
      });
  };

  pc.onaddstream = event => {
    const element = document.createElement("video");
    element.id = `remoteView+${userId}`;
    element.autoplay = "autoplay";
    element.srcObject = event.stream;
    remoteViewContainer.appendChild(element);
  };

  pc.oniceconnectionstatechange = event => {
    if (pc.iceConnectionState == "disconnected") {
      console.log("Disconnected:", userId);
      broadcastData({
        type: REMOVE_USER,
        from: userId
      });
    }
  };

  return pc;
};

const exchange = data => {
  let pc;

  if (!pcPeers[data.from]) {
    pc = createPC(data.from, false);
  } else {
    pc = pcPeers[data.from];
  }

  if (data.candidate) {
    pc.addIceCandidate(new RTCIceCandidate(JSON.parse(data.candidate)));
  }

  if (data.sdp) {
    sdp = JSON.parse(data.sdp);
    pc
      .setRemoteDescription(new RTCSessionDescription(sdp))
      .then(() => {
        if (sdp.type === "offer") {
          pc.createAnswer().then(answer => {
            pc.setLocalDescription(answer);
            broadcastData({
              type: EXCHANGE,
              from: currentUser,
              to: data.from,
              sdp: JSON.stringify(pc.localDescription)
            });
          });
        }
      })
      .catch(logError);
  }
};

const broadcastData = data => {
  $.ajax({
    url: "sessions",
    type: "post",
    data
  });
};

const logError = error => console.warn("Whoops! Error:", error);
