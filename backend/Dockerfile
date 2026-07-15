# Use Node.js as the base image
FROM node:18-bullseye-slim

# Set the working directory
WORKDIR /app

# Install Python, pip, and required system libraries for OpenCV/EasyOCR
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment for Python
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy package.json and install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy Python requirements and install Python dependencies
COPY requirements.txt ./
# We install torch with CPU only for a smaller image
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Pre-download EasyOCR models (so they don't download on first request)
RUN python -c "import easyocr; easyocr.Reader(['th', 'en'], gpu=False)"

# Expose port
EXPOSE 5000

# Start the Node.js application
CMD ["npm", "start"]
