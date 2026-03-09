#!/usr/bin/env bash
set -euo pipefail

CERTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nginx/certs"
CERT_NAME="notebooklm.api.dev+1"
HOSTNAMES=("notebooklm.api.dev" "notebooklm.api.prod")

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[certs]${NC} $*"; }
warn() { echo -e "${YELLOW}[certs]${NC} $*"; }
fail() { echo -e "${RED}[certs]${NC} $*" >&2; exit 1; }

install_mkcert() {
  log "mkcert not found — installing..."

  local os arch url

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  [[ "$arch" == "x86_64" ]]  && arch="amd64"
  [[ "$arch" == "aarch64" ]] && arch="arm64"
  [[ "$arch" == "armv7l" ]]  && arch="arm"

  local version="v1.4.4"
  url="https://github.com/FiloSottile/mkcert/releases/download/${version}/mkcert-${version}-${os}-${arch}"

  curl -fsSL "$url" -o /tmp/mkcert
  chmod +x /tmp/mkcert
  sudo mv /tmp/mkcert /usr/local/bin/mkcert

  log "mkcert ${version} installed."
}

install_ca() {
  log "Installing local CA into system trust store..."
  mkcert -install

  local nss_db="$HOME/.pki/nssdb"
  local ca_root
  ca_root="$(mkcert -CAROOT)"

  if [[ -d "$nss_db" ]]; then
    if command -v certutil &>/dev/null; then
      certutil -A -d "sql:${nss_db}" -t "C,," -n "mkcert local CA" \
        -i "${ca_root}/rootCA.pem" 2>/dev/null && \
        log "CA added to Chrome/Chromium NSS trust store." || \
        warn "certutil failed — Chrome/Chromium trust store not updated."
    else
      warn "certutil not found — Chrome/Chromium trust store not updated. Install libnss3-tools."
    fi
  fi

  warn "Firefox requires manual CA import:"
  warn "  Settings → Privacy & Security → View Certificates → Authorities → Import"
  warn "  File: $(mkcert -CAROOT)/rootCA.pem"
}

generate_cert() {
  log "Generating SAN certificate for: ${HOSTNAMES[*]}"
  mkdir -p "$CERTS_DIR"
  cd "$CERTS_DIR"
  mkcert "${HOSTNAMES[@]}"
  log "Certificate : ${CERTS_DIR}/${CERT_NAME}.pem"
  log "Private key : ${CERTS_DIR}/${CERT_NAME}-key.pem"
}

check_hosts() {
  local missing=()
  for host in "${HOSTNAMES[@]}"; do
    grep -q "$host" /etc/hosts || missing+=("$host")
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    warn "The following entries are missing from /etc/hosts:"
    for host in "${missing[@]}"; do
      warn "  127.0.0.1   $host"
    done
    warn "Add them with:"
    for host in "${missing[@]}"; do
      warn "  echo '127.0.0.1   $host' | sudo tee -a /etc/hosts"
    done
  else
    log "/etc/hosts entries verified."
  fi
}

main() {
  command -v mkcert &>/dev/null || install_mkcert

  if [[ -f "${CERTS_DIR}/${CERT_NAME}.pem" && -f "${CERTS_DIR}/${CERT_NAME}-key.pem" ]]; then
    warn "Certificates already exist at ${CERTS_DIR}."
    warn "Delete them and re-run this script to regenerate."
    warn "  rm ${CERTS_DIR}/${CERT_NAME}.pem ${CERTS_DIR}/${CERT_NAME}-key.pem"
    check_hosts
    exit 0
  fi

  install_ca
  generate_cert
  check_hosts

  log "Done. Start the stack with:"
  log "  docker compose up                              # development"
  log "  docker compose -f docker-compose.prod.yml up  # production"
  log ""
  log "Access the API at:"
  log "  https://notebooklm.api.dev/api/v1/health"
  log "  https://notebooklm.api.prod/api/v1/health"
}

main "$@"
