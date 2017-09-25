// BROADCAST TYPES
const INITIATE_CONNECTION = "initiateConnection";
const ROLLCALL = "rollcall";
const EXCHANGE = "exchange";
const REMOVE_USER = "removeUser";

// DOM ELEMENTS
const currentUser = document.getElementById("currentUser").innerHTML;
const selfView = document.getElementById("selfView");
const remoteViewContainer = document.getElementById("remoteViewContainer");

// CONFIG
const ice = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const videoConstraints = {
  audio: false,
  video: {
    width: 480,
    height: 360
  }
};

// GLOBAL OBJECTS
let pcPeers = {};
let usersInRoom = {};
let peersToConnect = {};
let localStream;

const initiateConnection = () => {
  broadcastData({
    type: ROLLCALL,
    from: currentUser,
    usersInRoom: JSON.stringify(usersInRoom)
  });
};

const rollcall = data => {
  usersInRoom[data.from] = true;

  currentUsersInRoom = JSON.parse(data.usersInRoom);
  isOnlyUser = Object.keys(currentUsersInRoom).length === 0;

  if (isOnlyUser) return;

  if (!currentUsersInRoom[currentUser]) {
    console.log(`User ${currentUser} will send an offer`)
    createPC(currentUser, true);
  }
};


const createPC = (userId, isOffer) => {
  console.log("adding pcPeers userId", userId, "to user", currentUser)

  let pc = new RTCPeerConnection(ice);
  pcPeers[userId] = pc;
  pc.addStream(localStream);
  pc.onnegotiationneeded = () => isOffer && createOffer();

  const createOffer = () => {
    pc
      .createOffer()
      .then(offer => {
        pc.setLocalDescription(offer);
        broadcastData({
          type: EXCHANGE,
          from: userId,
          sdp: JSON.stringify(pc.localDescription)
        });
      })
      .catch(logError);
  };

  pc.onicecandidate = event => {
    event.candidate &&
      broadcastData({
        type: EXCHANGE,
        from: userId,
        candidate: JSON.stringify(event.candidate)
      });
  };

  pc.onaddstream = event => {
    console.log("adding stream");
    const element = document.createElement("video");
    element.id = "remoteView";
    element.autoplay = "autoplay";
    element.srcObject = event.stream;
    remoteViewContainer.appendChild(element);
  };

  // TODO: this can tell when a user disconnects
  pc.oniceconnectionstatechange = event =>
    console.log("oniceconnectionstatechange", event.target.iceConnectionState);

  pc.onsignalingstatechange = event =>
    console.log("onsignalingstatechange", event);

  return pc;
};

const exchange = data => {
  console.log("exchanging data with:", data.from);

  let pc;

  if (!pcPeers[currentUser]) {
    pc = createPC(currentUser, false);
  } else {
    pc = pcPeers[currentUser];
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
              type: "exchange",
              from: currentUser,
              sdp: JSON.stringify(pc.localDescription)
            });
          });
        }
      })
      .catch(logError);
  }
};

const handleLeaveSession = () => {
  let pc = pcPeers[currentUser];
  if (pc) pc.close();

  broadcastData({
    type: REMOVE_USER,
    from: currentUser
  });

  let video = document.getElementById("remoteView");
  if (video) video.remove();
  location.reload();
};

const removeUser = data => {
  let video = document.getElementById("remoteView");
  if (video) video.remove();
  location.reload();
};

const handleJoinSession = async () => {
  App.session = await App.cable.subscriptions.create("SessionChannel", {
    connected: () => {
      broadcastData({ type: INITIATE_CONNECTION });
    },
    received: data => {
      // console.log("RECEIVED:", data);
      switch (data.type) {
        case INITIATE_CONNECTION:
          return initiateConnection();
        case ROLLCALL:
          return rollcall(data);
        case EXCHANGE:
          return data.from === currentUser ? "" : exchange(data);
        case REMOVE_USER:
          return removeUser(data);
        default:
          return;
      }
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

window.onload = () => {
  initialize();
};

const initialize = () => {
  navigator.mediaDevices
    .getUserMedia(videoConstraints)
    .then(stream => {
      localStream = stream;
      selfView.srcObject = stream;
      selfView.muted = true;
    })
    .catch(logError);
};

const logSuccess = () => {};
const logError = error => console.warn("Whoops! Error:", error);
