# TODO

* Scope chat sessions to specific rooms that user's can name. Think appear.in
* Grab XirSys ice credentials and pass them along instead of using googles

# Rails 5 + WebRTC = Magic

__How to recreate yourself__


## Basics

This is a very basic example of how to create a signaling server by leveraging Action Cable. A lot of the examples online use socket.io - but you might not want to spin up a Node server concurrently with your Rails App.

```
$ rails new action-cable-signaling-server --database=postgresql
$ cd action-cable-signaling-server
$ rails db:create
$ rails db:migrate
```

We won't be touching our database in this example but we do need a few controllers

```
$ rails g controller Pages home
$ rails g controller Sessions
```

Now we can wire up our routes. We only need two of them for all intents and purposes. Our root route will house the video conference. Second, our `POST /sessions` endpoint will be used to broadcast data using Action Cable via AJAX requests

```ruby
Rails.application.routes.draw do
  root 'pages#home'
  post '/sessions', to: 'sessions#create'
end
```

Let's make it so that we can inject JS into our root route somewhat elegantly. Inside of `application.html.erb`, add this yield statement

```html
  <%= yield %>
  <%= yield :page_js %>
```

Our folder structure will look like this:

```
├── app
│   ├── views
│   │   ├── devise
│   │   ├── layouts
│   │   ├── pages
│   │   │   ├── js
│   │   │   │   └── webrtc.js
│   │   │   └── home.html.erb
```

To wire up our `webrtc.js` file, we add this block inside of our `home.html.erb`

```html
<!-- home.html.erb -->
# ...

<% content_for :page_js do %>
  <script type="text/javascript">
    <%= render file: "#{Rails.root}/app/views/pages/js/webrtc.js" %>
  </script>
<% end %>
```

The full `home.html.erb` thus far:

```html
<h1>Action Cable + WebRTC + Xirsys</h1>

<video id="selfView" autoplay></video>
<div id="remoteViewContainer"></div>

<button onclick="handleJoinSession();">Join Session</button>
<button onclick="handleLeaveSession();">Leave Session</button>

<% content_for :page_js do %>
  <script type="text/javascript">
    <%= render file: "#{Rails.root}/app/views/pages/js/webrtc.js" %>
  </script>
<% end %>
```

We'll throw some JS inside of `webrtc.js` and log something out so that we can make sure we're good to go

```js
window.onload = () => {
  initialize();
};

const initialize = () => {
  console.log("initializing");
};

const handleJoinSession = () => {
  console.log("Join Session");
};
```

When we refresh the page, we should see a console.log inside of our dev tools that reads "initializing" and when we press "Join Session", we should see a console.log statement that reads "Join Session"

## Action Cable Setup

We'll generate a channel called `Session`

```
$ rails g channel Session
```

This generates:

```
create     app/channels/session_channel.rb
identical  app/assets/javascripts/cable.js
create     app/assets/javascripts/channels/session.coffee
```

We will only be taking a look at `session_channel.rb`. The logic normally found in `session.coffee` will be placed in `webrtc.js`

Make sure to go inside of `session.coffee` and **remove all of the content from there**

Inside of `session_channel.rb`

```ruby
  def subscribed
    stream_from "session_channel"
  end
```

Add this line to your routes:

```
mount ActionCable.server, at: '/cable'
```

Now that we're subscribed to `session_channel`, let's broadcast data every time we `POST /sessions`

Inside of our `sessions_controller` that we generated earlier, we can write our `create` method

```ruby
class SessionsController < ApplicationController
  def create
    head :no_content
    ActionCable.server.broadcast "session_channel", params
  end
end
```

* Note that `params` is just an object that we will be sending from (any) client that is wired up to our app

___

At this point, you might be wondering, "How are we going to send data from the client to the server and broadcast that back to connected users?"

If you weren't that's okay. The answer is AJAX

Inside of your `gemfile`

```ruby
gem 'jquery-rails', '~> 4.3', '>= 4.3.1'
```

include it in your `application.js`

```
//= require jquery
//= require jquery_ujs
```

Before we can start making POST requests, we have to set a few things up. Inside of our `ApplicationController`:

```ruby
protect_from_forgery unless: -> { request.format.json? }
```

While we're at it, let's enable CORS

```ruby
# Gemfile
gem 'rack-cors', '~> 0.4.1'

# application.rb
config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'
    resource '*', :headers => :any, :methods => [:get, :post, :options, :delete]
  end
end
```

Finally... let's test out our ActionCable by POST'ing to sessions. We'll write a helper method inside of `webrtc.js`

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

const broadcastData = data => {
  $.ajax({
    url: "sessions",
    type: "post",
    data
  });
};
```

We are doing a couple things here. Our helper `broadcastData` is a wrapper around an AJAX request. When the button is pressed, we invoke `handleJoinSession` which creates a subscription to our `SessionChannel`.

Once a user connects, we POST to sessions an object:

```js
broadcastData({ type: "initiateConnection" });
```

Inside of our console, we should see this:

```
RECEIVED: {type: "initiateConnection", controller: "sessions", action: "create"}
```

We are seeing this because our `received` method will log out data that is received from the subscription. If you see that, congrats! You're now able to send and receive data. This is the foundation for the WebRTC dance and is paramount for our signaling server

## Spooky WebRTC Stuff

Okay, we're almost to the spooky webrtc stuff. But first, let's create the concept of unique users. We'll generate a fake user_id

Inside of `PagesController`,

```ruby
class PagesController < ApplicationController
  def home
    @random_number = rand(0...10_000)
  end
end
```

Then, we'll add this to the top of our `home.html.erb` so that we can access it in our JS

```html
<div>Random user id:
  <span id="currentUser"><%= @random_number %></span>
</div>
```

```js
const currentUser = document.getElementById("currentUser").innerHTML;
```

Just a little more setup, let's grab some stuff from the DOM and set up a configuration object that will hold our `iceServers`

```js
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
```

We are just grabbing the elements that will hold local and remote views

We are also instantiating a couple of empty objects that will hold the users in the room

`localStream` will hold the current users's stream... which we'll grab now! Inside of our `initialize` function, we'll call `navigator.mediaDevices.getUserMedia` and set the stream to `localStream`

Our `webrtc.js` should look like this now:

```js
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
    data
  });
};

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

const logError = error => console.warn("Whoops! Error:", error);
```

Ok - up to this point we have a user's video on the screen. When they press "Join Session", they initiate a connection to Action Cable


Here's a skeleton of our final script with some comments on what each function is doing.

```js
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
  // connect to action cable
  // switch over broadcasted data.type and decide what to do from there
};

const handleLeaveSession = () => {
  // leaves session
};

const connectUser = userId => {
  // routes a user to join a room
};

const joinRoom = data => {
  // joins a room by creating a peer connection
};

const removeUser = data => {
  // removes user from a room
};

const createPC = (userId, isOffer) => {
  // new instance of peer connection
};

const exchange = data => {
  // set ice candidates
  // set remote and location descriptions
};

const broadcastData = data => {
  $.ajax({
    url: "sessions",
    type: "post",
    data
  });
};

const logError = error => console.warn("Whoops! Error:", error);
```

Here is the file all filled out

```js
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
```


## Deployment

Make sure you add the `redis` gem:

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
