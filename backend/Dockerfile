# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Install system dependencies (ImageMagick is required for MoviePy)
RUN apt-get update && apt-get install -y \
    imagemagick \
    ffmpeg \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Fix ImageMagick policy to allow text processing
# This is a common bug fix for MoviePy on Linux
RUN sed -i 's/none/read,write/g' /etc/ImageMagick-6/policy.xml

# Set the working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Create the temp directory explicitly
RUN mkdir -p temp_storage

# Expose the port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]