# Dockerfile for agent-computer:base
# Provides a secure, isolated environment for AI agents to execute code

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install essential packages and development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core utilities
    bash coreutils findutils grep sed gawk \
    ca-certificates curl wget git vim nano less fd-find \
    # Process and system tools
    htop tmux screen psmisc procps \
    # Development tools
    build-essential gcc g++ make cmake \
    # Python ecosystem
    python3 python3-pip python3-venv python3-dev \
    # Node.js ecosystem
    nodejs npm \
    # Network tools
    netcat-openbsd iputils-ping dnsutils openssh-client \
    # Archive tools
    zip unzip tar gzip \
    # Text processing
    jq xmlstarlet \
    # Search Tools
    ripgrep \
    # RE tools
    afl gdb valgrind ltrace strace tshark

# Install radare2
RUN git clone https://github.com/radareorg/radare2 && cd radare2 && sys/install.sh

# Create non-root user 'agent' with uid 1000
RUN groupadd -g 1000 agent && \
    useradd -u 1000 -g 1000 -m -s /bin/bash agent && \
    # Give agent sudo access (for permissive mode)
    echo 'agent ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Install Python packages as agent user
USER agent
WORKDIR /home/agent

# Create Python virtual environment and install common packages
RUN python3 -m venv /home/agent/.venv && \
    /home/agent/.venv/bin/pip install --upgrade pip && \
    /home/agent/.venv/bin/pip install \
    # Data science and analysis
    numpy pandas matplotlib seaborn plotly \
    # Web and API tools
    requests httpx beautifulsoup4 \
    # Development tools
    ipython jupyter black flake8 pytest \
    # RE python tools
    frida-tools frida r2pipe angr

# Configure shell environment
RUN echo 'export PATH="/home/agent/.venv/bin:$PATH"' >> /home/agent/.bashrc && \
    echo 'export PYTHONPATH="/home/agent:$PYTHONPATH"' >> /home/agent/.bashrc && \
    echo 'alias ll="ls -la"' >> /home/agent/.bashrc && \
    echo 'alias la="ls -la"' >> /home/agent/.bashrc && \
    echo 'cd /home/agent' >> /home/agent/.bashrc

# Default command
CMD ["/bin/bash"]

# Metadata
LABEL maintainer="agent-computer" \
      description="Secure sandbox environment for AI agents" \
      version="1.0"
