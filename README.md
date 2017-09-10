# TODO

* Scope chat sessions to specific rooms that user's can name. Think appear.in
* Ability for multiple users to join conference
* Ability for user to leave conference and join back in
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
    data,
    success: () => {},
    error: () => {}
  });
}
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
const selfView = document.getElementById("selfView");
const remoteViewContainer = document.getElementById("remoteViewContainer");
const configuration = { iceServers: [{ url: "stun:stun.l.google.com:19302" }] };

let pcPeers = {};
let usersInRoom = {};
let localStream;
```

We are just grabbing the elements that will hold local and remote views

We are also instantiating a couple of empty objects that will hold the users in the room

`localStream` will hold the current users's stream... which we'll grab now! Inside of our `initialize` function, we'll call `navigator.mediaDevices.getUserMedia` and set the stream to `localStream`

Our `webrtc.js` should look like this now:

```js
const currentUser = document.getElementById("currentUser").innerHTML;
const selfView = document.getElementById("selfView");
const remoteViewContainer = document.getElementById("remoteViewContainer");
const configuration = { iceServers: [{ url: "stun:stun.l.google.com:19302" }] };

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

window.onload = () => {
  initialize();
};

const initialize = () => {
  navigator.mediaDevices
  .getUserMedia({
    audio: true,
    video: true
  })
  .then(stream => {
    localStream = stream;
    selfView.src = URL.createObjectURL(stream);
    selfView.muted = true;
  })
  .catch(logError);
};

const logSuccess = () => {}
const logError = error => console.warn("Whoops! Error:", error);
```

Ok - up to this point we have a user's video on the screen. When they press "Join Session", they initiate a connection to Action Cable


Here's a skeleton of our final script with some comments on what each function is doing.

```js
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

// initiate connection for a user
// broadcast a "rollcall" to see which users are in the room
const initiateConnection = () => {
};

// add the current user to the `usersInRoom` hash
// return early if the current user is the only user in the room
// if someone else is in the room, the current user will initiate the WebRTC dance by invoking `createPC`
const rollcall = data => {
};

// creates a new instance of RTCPeerConnection
// adds the users local stream to the instance of the peer connection
// creates an offer to the other users who is in the room
// this offer is set as the current user's local description
// then we broadcast "EXCHANGE" so that the user's local description can be sent to the other user who is in the room.
// the other use in the room will take the "local description" and set it as their "remote description"
// they will then create an answer and set that as their local description while sending it to the original sender of the offer.
// the original sender of the offer will take the answer and set it as their remote description
// in this function, we also exchange ice candidates
// in this function, we also add remote streams
const createPC = (userId, isOffer) => {
};

// when exchange is invoked we take a look at the data that is being passed
// if we send an ice candidate, we exchange ice candidates
// if we send a session description, we must look at if it is an offer or an answer
const exchange = data => {
};

// leaves a session and closes a connection
const handleLeaveSession = () => {
}

// removes the remote video from the DOM
const removeUser = (data) => {
}

// routes the exchange of data as well as initiates the instance of action cable
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
        width: 320,
        height: 240,
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

```

Here is the file all filled out

```js
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
        width: 320,
        height: 240,
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
