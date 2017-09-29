require 'rest-client'
require 'json'

class PagesController < ApplicationController
  def home
    @random_number = rand(0...10_000)

    response = RestClient.put ENV['GET_XIRSYS_ICE'], accept: :json
    @json_response = response.to_json
  end
end
