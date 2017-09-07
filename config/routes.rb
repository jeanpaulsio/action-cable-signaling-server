Rails.application.routes.draw do
  root 'pages#home'
  resources :sessions

  mount ActionCable.server, at: '/cable'
end
