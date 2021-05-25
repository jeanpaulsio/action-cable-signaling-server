# frozen_string_literal: true

source "https://rubygems.org"

git_source(:github) do |repo_name|
  repo_name = "#{repo_name}/#{repo_name}" unless repo_name.include?("/")
  "https://github.com/#{repo_name}.git"
end

ruby "2.6.5"

gem "rails",        "6.0.3.1"

gem "bootsnap",     "1.4.6"
gem "jbuilder",     "2.10.0"
gem "pg",           "1.2.3"
gem "puma",         "4.3.8"
gem "rack-cors",    "1.1.1"
gem "redis",        "4.1.3"
gem "sass-rails",   "6.0.0"
gem "uglifier",     "4.2.0"
gem "webpacker",    "5.1.1"

group :development, :test do
  gem "byebug", platforms: %i[mri mingw x64_mingw]
  gem "capybara", "~> 2.13"
  gem "selenium-webdriver"
end

group :development do
  gem "listen", ">= 3.0.5", "< 3.2"
  gem "rubocop",               "0.81.0", require: false
  gem "rubocop-performance",   "1.5.2"
  gem "rubocop-rails",         "2.5.2"
  gem "spring"
  gem "spring-watcher-listen", "~> 2.0.0"
  gem "web-console", ">= 3.3.0"
end

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem "tzinfo-data", platforms: %i[mingw mswin x64_mingw jruby]
