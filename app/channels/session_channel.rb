# frozen_string_literal: true

class SessionChannel < ApplicationCable::Channel
  def subscribed
    stream_from "session_channel"
  end

  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
  end
end
