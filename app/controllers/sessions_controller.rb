class SessionsController < ApplicationController
  def create
    head :no_content
    ActionCable.server.broadcast "session_channel", params
  end
end
