<div align="center">
<img src="https://emojipedia-us.s3.amazonaws.com/thumbs/240/apple/118/handshake_1f91d.png" />
<h1>Action Cable Signaling Server</h1>

<p>A Rails implementation of a signaling server for WebRTC apps leveraging Action Cable instead of Socket.io</p>
</div>

## Resources

* [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
* [Google Developer Docs](https://codelabs.developers.google.com/codelabs/webrtc-web/#0)

I'd highly recommend reading through some of the WebRTC documentation from MDN and Google.

<hr />

## 2020 Update

_Update May 27, 2020_

You're probably here because you've done a little bit of research and you already know that you want to build a signaling server with Rails. The goal of this repository is to help you get a basic signaling server up and running using vanilla JS. In the future, I'd like to see how we might use different front-end technologies alongside this implementation. I'm particularly excited about:

* Stimulus + [StimulusReflex](https://github.com/hopsoft/stimulus_reflex)
* React
* Vue

The DIY section of this readme is now updated for Rails 6 + Webpacker. If you're looking for details on implementation for Rails 5, click [here](https://github.com/jeanpaulsio/action-cable-signaling-server/tree/f879f3f32c93860d3f27340371b77f7a45ecd3e7).

## Problem
WebRTC is hard enough as it is. You want to implement real-time communication in your Rails app (video chat, screensharing, etc) but all of the examples online use socket.io. But you're a Rails dev! You don't want to spin up a Node server and create an Express app just for this feature.

## Solution
We can broadcast messages and take care of the signaling handshake 🤝 between peers (aka the WebRTC dance) using Action Cable.

## Known Bugs 🐛
~~Right now this example only works in Google Chrome. PR's welcome to get this up and running in FireFox and Safari!~~ [f2a950](https://github.com/jeanpaulsio/action-cable-signaling-server/commit/f2a950a46dc98235ca8a485b6586a8416688180f) Thank you, [@gobijan](https://github.com/gobijan)

## DIY Approach

Here, I'll walk you through implementing your own [signaling server](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling) in Rails.

In this example, we'll make a video chat app. However, WebRTC can do more than that! Once your signaling server is set up, it's possible to extend your app to support other cool stuff like screen sharing.

We're going to be creating a few files for this.

```
├── app
│   ├── javascript
│   │   └── signaling_server.js
│   ├── channels
│   │   └── session_channel.rb
│   ├── controllers
│   │   └── sessions_controller.rb
│   │   └── pages_controller.rb
│   ├── views
│   │   ├── pages
│   │   │   └── home.html.erb
```

* `signaling_server.js` - Holds all of our WebRTC JS logic. We'll also be broadcasting data to our backend using JavaScript's `fetch` API. Data will be broadcasted with Action Cable.
* `session_channel.rb` - Subscribes a user to a particular channel. In this case, `session_channel`.
* `sessions_controller.rb` - Endpoint that will broadcast data.
* `pages_controller.rb` - Will house our video stream. Nothing special about this.
* `home.html.erb` - Corresponding view to `pages#home`.

### Routes

```ruby
# config/routes.rb

Rails.application.routes.draw do
  root 'pages#home'
  post '/sessions', to: 'sessions#create'

  mount ActionCable.server, at: '/cable'
end
```

Our routes will look something like this. We haven't done anything with Action Cable just yet, but do take note that we mount the server in our routes.


### Scaffolding out the View

```html
<!-- app/views/pages/home.html.erb -->

<h1>Action Cable Signaling Server</h1>

<div>Random User ID:
  <span id="current-user"><%= @random_number %></span>
</div>

<div id="remote-video-container"></div>
<video id="local-video" autoplay></video>

<hr />

<button id="join-button">
  Join Room
</button>

<button id="leave-button">
  Leave Room
</button>
```

The reason we have `@random_number` is because each user should have a unique identifier when joining the room. In a real app, this could be something like `@user.id` or `current_user.id`.

The `PagesController` is super simple:

```ruby
# app/controllers/pages_controller.rb

class PagesController < ApplicationController
  def home
    @random_number = rand(0...10_000)
  end
end
```

### Action Cable Setup

We'll create two files for this

```ruby
# app/channels/session_channel.rb

class SessionChannel < ApplicationCable::Channel
  def subscribed
    stream_from "session_channel"
  end

  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
  end
end
```

```ruby
# app/controllers/sessions_controller.rb

class SessionsController < ApplicationController
  def create
    head :no_content
    ActionCable.server.broadcast "session_channel", session_params
  end

  private

  def session_params
    params.require(:session).permit(:type, :from, :to, :sdp, :candidate)
  end
end
```

`session_params` should give you insight as to what we're broadcasting in order to complete the WebRTC dance.

### `signaling_server.js`

We'll test our Action Cable connection before diving into the WebRTC portion

```js
// app/javascript/signaling_server.js

import consumer from "./channels/consumer"; // file generated @rails/actioncable

const handleJoinSession = async () => {
  consumer.subscriptions.create("SessionChannel", {
    connected: () => {
      broadcastData({ type: "initiateConnection" });
    },
    received: data => {
      console.log("RECEIVED:", data);
    }
  });
};

const handleLeaveSession = () => {};

const broadcastData = (data) => {
  /**
   * Add CSRF protection: https://stackoverflow.com/questions/8503447/rails-how-to-add-csrf-protection-to-forms-created-in-javascript
   */
  const csrfToken = document.querySelector("[name=csrf-token]").content;
  const headers = new Headers({
    "content-type": "application/json",
    "X-CSRF-TOKEN": csrfToken,
  });

  fetch("sessions", {
    method: "POST",
    body: JSON.stringify(data),
    headers,
  });
};
```

We're doing a couple things here. The `broadcastData` function is just a wrapper around JavaScript's `fetch` API. When we press "Join Room" in our view, we invoke `handleJoinSession()` which creates a subscription to `SessionChannel`.

Once a user connects, we `POST` to sessions an object. Remember, we whitelisted `:type` so our `"initiateConnection"` value will be accepted.

If you take a peek at your running server, you should see something like:

```
[ActionCable] Broadcasting to session_channel: <ActionController::Parameters {"type"=>"initiateConnection"} permitted: true>
```

If you open up your console via dev tools, you should see this message:

```
RECEIVED: {type: "initiateConnection"}
```

We are seeing this because our received method will log out data that is received from the subscription. If you see that, congrats! You're now able to send and receive data. This is the foundation for the WebRTC dance and is paramount for our signaling server.

### More WebRTC setup

Here's a commented out skeleton of our `signaling_server.js` file

```javascript
import consumer from "./channels/consumer";

// Broadcast Types
const JOIN_ROOM = "JOIN_ROOM";
const EXCHANGE = "EXCHANGE";
const REMOVE_USER = "REMOVE_USER";

// DOM Elements
let currentUser;
let localVideo;
let remoteVideoContainer;

// Objects
let pcPeers = {};
let localstream;

window.onload = () => {
  currentUser = document.getElementById("current-user").innerHTML;
  localVideo = document.getElementById("local-video");
  remoteVideoContainer = document.getElementById("remote-video-container");
};

// Ice Credentials
const ice = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Add event listener's to buttons
// We need to do this now that our JS isn't handled by the asset pipeline
document.addEventListener("DOMContentLoaded", () => {
  const joinButton = document.getElementById("join-button");
  const leaveButton = document.getElementById("leave-button");

  joinButton.onclick = handleJoinSession;
  leaveButton.onclick = handleLeaveSession;
});

// Initialize user's own video
document.onreadystatechange = () => {
  if (document.readyState === "interactive") {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: true,
      })
      .then((stream) => {
        localstream = stream;
        localVideo.srcObject = stream;
        localVideo.muted = true;
      })
      .catch(logError);
  }
};

const handleJoinSession = async () => {
  // connect to Action Cable
  // Switch over broadcasted data.type and decide what to do from there
};

const handleLeaveSession = () => {
  // leave session
};

const joinRoom = (data) => {
  // create a peerConnection to join a room
};

const removeUser = (data) => {
  // remove a user from a room
};

const createPC = (userId, isOffer) => {
  // new instance of RTCPeerConnection
  // potentially create an "offer"
  // exchange SDP
  // exchange ICE
  // add stream
  // returns instance of peer connection
};

const exchange = (data) => {
  // add ice candidates
  // sets remote and local description
  // creates answer to sdp offer
};

const broadcastData = (data) => {
  /**
   * Add CSRF protection: https://stackoverflow.com/questions/8503447/rails-how-to-add-csrf-protection-to-forms-created-in-javascript
   */
  const csrfToken = document.querySelector("[name=csrf-token]").content;
  const headers = new Headers({
    "content-type": "application/json",
    "X-CSRF-TOKEN": csrfToken,
  });

  fetch("sessions", {
    method: "POST",
    body: JSON.stringify(data),
    headers,
  });
};

const logError = error => console.warn("Whoops! Error:", error);
```

And here's our final JS

```javascript
// app/javascript/signaling_server.js

import consumer from "./channels/consumer";

// Broadcast Types
const JOIN_ROOM = "JOIN_ROOM";
const EXCHANGE = "EXCHANGE";
const REMOVE_USER = "REMOVE_USER";

// DOM Elements
let currentUser;
let localVideo;
let remoteVideoContainer;

// Objects
let pcPeers = {};
let localstream;

window.onload = () => {
  currentUser = document.getElementById("current-user").innerHTML;
  localVideo = document.getElementById("local-video");
  remoteVideoContainer = document.getElementById("remote-video-container");
};

// Ice Credentials
const ice = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Add event listener's to buttons
document.addEventListener("DOMContentLoaded", () => {
  const joinButton = document.getElementById("join-button");
  const leaveButton = document.getElementById("leave-button");

  joinButton.onclick = handleJoinSession;
  leaveButton.onclick = handleLeaveSession;
});

// Initialize user's own video
document.onreadystatechange = () => {
  if (document.readyState === "interactive") {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: true,
      })
      .then((stream) => {
        localstream = stream;
        localVideo.srcObject = stream;
        localVideo.muted = true;
      })
      .catch(logError);
  }
};

const handleJoinSession = async () => {
  consumer.subscriptions.create("SessionChannel", {
    connected: () => {
      broadcastData({
        type: JOIN_ROOM,
        from: currentUser,
      });
    },
    received: (data) => {
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
    },
  });
};

const handleLeaveSession = () => {
  for (let user in pcPeers) {
    pcPeers[user].close();
  }
  pcPeers = {};

  remoteVideoContainer.innerHTML = "";

  broadcastData({
    type: REMOVE_USER,
    from: currentUser,
  });
};

const joinRoom = (data) => {
  createPC(data.from, true);
};

const removeUser = (data) => {
  console.log("removing user", data.from);
  let video = document.getElementById(`remoteVideoContainer+${data.from}`);
  video && video.remove();
  delete pcPeers[data.from];
};

const createPC = (userId, isOffer) => {
  let pc = new RTCPeerConnection(ice);
  pcPeers[userId] = pc;

  for (const track of localstream.getTracks()) {
    pc.addTrack(track, localstream);
  }

  isOffer &&
    pc
      .createOffer()
      .then((offer) => {
        return pc.setLocalDescription(offer);
      })
      .then(() => {
        broadcastData({
          type: EXCHANGE,
          from: currentUser,
          to: userId,
          sdp: JSON.stringify(pc.localDescription),
        });
      })
      .catch(logError);

  pc.onicecandidate = (event) => {
    event.candidate &&
      broadcastData({
        type: EXCHANGE,
        from: currentUser,
        to: userId,
        candidate: JSON.stringify(event.candidate),
      });
  };

  pc.ontrack = (event) => {
    const element = document.createElement("video");
    element.id = `remoteVideoContainer+${userId}`;
    element.autoplay = "autoplay";
    element.srcObject = event.streams[0];
    remoteVideoContainer.appendChild(element);
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState == "disconnected") {
      console.log("Disconnected:", userId);
      broadcastData({
        type: REMOVE_USER,
        from: userId,
      });
    }
  };

  return pc;
};

const exchange = (data) => {
  let pc;

  if (!pcPeers[data.from]) {
    pc = createPC(data.from, false);
  } else {
    pc = pcPeers[data.from];
  }

  if (data.candidate) {
    pc.addIceCandidate(new RTCIceCandidate(JSON.parse(data.candidate)))
      .then(() => console.log("Ice candidate added"))
      .catch(logError);
  }

  if (data.sdp) {
    const sdp = JSON.parse(data.sdp);
    pc.setRemoteDescription(new RTCSessionDescription(sdp))
      .then(() => {
        if (sdp.type === "offer") {
          pc.createAnswer()
            .then((answer) => {
              return pc.setLocalDescription(answer);
            })
            .then(() => {
              broadcastData({
                type: EXCHANGE,
                from: currentUser,
                to: data.from,
                sdp: JSON.stringify(pc.localDescription),
              });
            });
        }
      })
      .catch(logError);
  }
};

const broadcastData = (data) => {
  /**
   * Add CSRF protection: https://stackoverflow.com/questions/8503447/rails-how-to-add-csrf-protection-to-forms-created-in-javascript
   */
  const csrfToken = document.querySelector("[name=csrf-token]").content;
  const headers = new Headers({
    "content-type": "application/json",
    "X-CSRF-TOKEN": csrfToken,
  });

  fetch("sessions", {
    method: "POST",
    body: JSON.stringify(data),
    headers,
  });
};

const logError = (error) => console.warn("Whoops! Error:", error);
```

### Deployment (Heroku)

You would deploy this app the same way you would any other Rails app that is using ActionCable.

Typical redis stuff

```ruby
#Gemfile

gem "redis"
```

Then

```
$ bundle install
$ heroku create
$ heroku addons:create redistogo
```

Adding `redistogo` will automatically add an environment variable to your project with the key `REDISTOGO_URL`

```yaml
# config/cable.yml

production:
  adapter: redis
  url: <%= ENV.fetch("REDISTOGO_URL") { "redis://localhost:6379/1" } %>
  channel_prefix: action_cable_signaling_server_production
```

```ruby
# config/environments/production.rb

config.action_cable.url = 'wss://yourapp.herokuapp.com/cable'
config.action_cable.allowed_request_origins = [ '*' ]
```

```
$ git add .
$ git commit -m 'ready to ship'
$ git push heroku master
```

## License

MIT
