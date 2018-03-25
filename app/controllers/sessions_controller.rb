class SessionsController < ApplicationController
  def create
    head :no_content
    ActionCable.server.broadcast 'session_channel', session_params
  end

  private

  def session_params
    params.permit(:type, :from, :to, :sdp, :candidate)
  end
end
