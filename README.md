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
```

We are just grabbing the elements that will hold local and remote views 
