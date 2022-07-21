  
FROM debian:jessie

LABEL maintainer="Matthew A. Raymer<matthew@anomalistdesign.com>"

# Install cron, certbot, bash, plus any other dependencies
RUN apt-get update && \
    apt-get install -y cron bash wget curl && \
    curl -sL https://deb.nodesource.com/setup_10.x | bash - && \
    apt install -y nodejs

WORKDIR /usr/local/bin/
RUN wget https://dl.eff.org/certbot-auto
RUN mv certbot-auto certbot
RUN chmod a+x ./certbot
# Run certbot-auto so that it installs itself
RUN /usr/local/bin/certbot -n certificates

VOLUME /data/letsencrypt
VOLUME /etc/letsencrypt
VOLUME /etc/certs

WORKDIR /usr/local/etc/ssl-monitor

VOLUME /usr/local/etc/ssl-monitor

COPY . .

CMD node /usr/local/etc/ssl-monitor/app.js