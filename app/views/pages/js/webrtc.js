const INITIATE_CONNECTION = "initiateConnection";
const ROLLCALL = "rollcall";
const EXCHANGE = "exchange";
const REMOVE_USER = "removeUser"

const currentUser = document.getElementById("currentUser").innerHTML;
const selfView = document.getElementById("selfView");
const remoteViewContainer = document.getElementById("remoteViewContainer");
const configuration = { iceServers: [{ url: "stun:stun.l.google.com:19302" }] };

let pcPeers = {};
let usersInRoom = {};
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
    createPC(currentUser, true);
    console.log("sending offer from currentUser", currentUser)
  }
};

const createPC = (userId, isOffer) => {
  let pc = new RTCPeerConnection(configuration);
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
    console.log("adding stream")
    const element = document.createElement("video");
    element.id = "remoteView";
    element.autoplay = "autoplay";
    element.src = URL.createObjectURL(event.stream);
    remoteViewContainer.appendChild(element);
  };

  return pc;
};

const exchange = data => {
  console.log("exchanging data with:", data.from)

  let pc;

  if (!pcPeers[currentUser]) {
    pc = createPC(currentUser, false);
  } else {
    pc = pcPeers[currentUser];
  }

  if (data.candidate) {
    let candidate = new RTCIceCandidate(JSON.parse(data.candidate));

    pc
      .addIceCandidate(candidate)
      .then(logSuccess)
      .catch(logError);
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

  // removeUser();
  let video = document.getElementById("remoteView");
  if (video) video.remove();
  location.reload();
}

const removeUser = (data) => {
  let video = document.getElementById("remoteView");
  if (video) video.remove();
  location.reload();
}

const handleJoinSession = async () => {
  App.session = await App.cable.subscriptions.create("SessionChannel", {
    connected: () => {
      broadcastData({ type: INITIATE_CONNECTION });
    },
    received: data => {
      console.log("RECEIVED:", data);
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
    .getUserMedia({
      audio: false,
      video: {
        width: 1280,
        height: 720,
      },
    })
    .then(stream => {
      localStream = stream;
      selfView.src = URL.createObjectURL(stream);
      selfView.muted = true;
    })
    .catch(logError);
};

const logSuccess = () => {};
const logError = error => console.warn("Whoops! Error:", error);
