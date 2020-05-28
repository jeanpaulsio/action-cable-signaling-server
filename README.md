<div align="center">
<img src="https://emojipedia-us.s3.amazonaws.com/thumbs/240/apple/118/handshake_1f91d.png" />
<h1>Action Cable Signaling Server</h1>

<p>A Rails implementation of a signaling server for WebRTC apps leveraging Action Cable instead of Socket.io</p>
</div>

<hr />

## Problem
WebRTC is hard enough as it is. You want to implement real-time communication in your Rails app (video chat, screensharing, etc) but all of the examples online use socket.io. But you're a Rails dev! You don't want to spin up a Node server and create an Express app just for this feature.

## Solution
We can broadcast messages and take care of the signaling handshake 🤝 between peers (aka the WebRTC dance) using Action Cable.

## Known Bugs 🐛
Right now this example only works in Google Chrome. PR's welcome to get this up and running in FireFox and Safari!

## DIY Approach

Here, I'll walk you through implementing your own signaling server from scratch.

In this example, we'll make a video chat app. However, WebRTC can do more than that! Once your signaling server is set up, it's possible to extend your app to support other cool stuff like screen sharing.

We're going to be creating a few files for this.

```
├── app
│   ├── assets
│   │   ├── javascripts
│   │   │   └── signaling-server.js
│   ├── channels
│   │   └── session_channel.rb
│   ├── controllers
│   │   └── sessions_controller.rb
│   │   └── pages_controller.rb
│   ├── views
│   │   ├── pages
│   │   │   └── home.html.erb
```

* `signaling-server.js` - Holds all of our WebRTC JS logic. We'll also be sending data to our backend using JavaScript's `fetch` API. Data will be broadcasted with Action Cable.
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


### ApplicationController

```ruby
# app/controllers/application_controller.rb

class ApplicationController < ActionController::Base
  protect_from_forgery unless: -> { request.format.json? }
end
```

We also need to make sure that we're accepting `json` requests inside of our `ApplicationController`.

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

<button onclick="handleJoinSession()">
  Join Room
</button>

<button onclick="handleLeaveSession()">
  Leave Room
</button>
```

The reason we have `@random_number` is because each user should have a unique identifier when joining the room. In a real app, this could be something like `@user.id`.

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

We'll need to create just two files for this

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
    params.permit(:type, :from, :to, :sdp, :candidate)
  end
end
```

Our whitelisted params should give you a little insight as to what we're broadcasting in order to complete the WebRTC dance.

### signaling-server.js

We'll test our Action Cable connection before diving into the WebRTC portion

```js

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

const handleLeaveSession = () => {};

const broadcastData = data => {
  fetch("sessions", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "content-type": "application/json" }
  });
};
```

We're doing a couple things here. The `broadcastData` function is just a wrapper around JavaScript's `fetch` API. When we press "Join Room" in our view, we invoke `handleJoinSession()` which creates a subscription to `SessionChannel`.

Once a user connects, we `POST` to sessions an object. Remember, we whitelisted `:type` so our `initiateConnection` value will be accepted.

If you take a peek at your running server, you should see something like:

```
[ActionCable] Broadcasting to session_channel: <ActionController::Parameters {"type"=>"initiateConnection"} permitted: true>
```

If you open up your console via dev tools, you should see this message:

```
RECEIVED: {type: "initiateConnection"}
```

We are seeing this because our received method will log out data that is received from the subscription. If you see that, congrats! You're now able to send and receive data. This is the foundation for the WebRTC dance and is paramount for our signaling serve.

### More WebRTC setup

Here's a commented out skeleton of our `signaling-server.js` file

```javascript
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

// Initialize user's own video
document.onreadystatechange = () => {
  if (document.readyState === "interactive") {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: true
      })
      .then(stream => {
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

const joinRoom = data => {
  // create a peerConnection to join a room
};

const removeUser = data => {
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

const exchange = data => {
  // add ice candidates
  // sets remote and local description
  // creates answer to sdp offer
};

const broadcastData = data => {
  fetch("sessions", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "content-type": "application/json" }
  });
};

const logError = error => console.warn("Whoops! Error:", error);
```

And here's our final JS

```javascript
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

// Initialize user's own video
document.onreadystatechange = () => {
  if (document.readyState === "interactive") {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: true
      })
      .then(stream => {
        localstream = stream;
        localVideo.srcObject = stream;
        localVideo.muted = true;
      })
      .catch(logError);
  }
};

const handleJoinSession = async () => {
  App.session = await App.cable.subscriptions.create("SessionChannel", {
    connected: () => {
      broadcastData({
        type: JOIN_ROOM,
        from: currentUser
      });
    },
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

  remoteVideoContainer.innerHTML = "";

  broadcastData({
    type: REMOVE_USER,
    from: currentUser
  });
};

const joinRoom = data => {
  createPC(data.from, true);
};

const removeUser = data => {
  console.log("removing user", data.from);
  let video = document.getElementById(`remoteVideoContainer+${data.from}`);
  video && video.remove();
  delete pcPeers[data.from];
};

const createPC = (userId, isOffer) => {
  let pc = new RTCPeerConnection(ice);
  pcPeers[userId] = pc;
  pc.addStream(localstream);

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
    element.id = `remoteVideoContainer+${userId}`;
    element.autoplay = "autoplay";
    element.srcObject = event.stream;
    remoteVideoContainer.appendChild(element);
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
    pc
      .addIceCandidate(new RTCIceCandidate(JSON.parse(data.candidate)))
      .then(() => console.log("Ice candidate added"))
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
  fetch("sessions", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "content-type": "application/json" }
  });
};

const logError = error => console.warn("Whoops! Error:", error);
```

### Deployment (Heroku)

You would deploy this app the same way you would any other Rails app that is using ActionCable.

The only caveat is that in order to use `const` and `let` declarations in the Rails asset pipeline, we need to configure the uglifier.

```ruby
# config/environments/production.rb

config.assets.js_compressor = Uglifier.new(harmony: true)
```

From here, it's your typical redis stuff:

```ruby
#Gemfile

gem 'redis', '~> 3.0'
```

Then

```
$ bundle install
$ heroku create
$ heroku addons:create redistogo
$ heroku config | grep REDISTOGO_URL
```

```yaml
# config/cable.yml

production:
  adapter: redis
  url: ${REDISTOGO_URL}
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
