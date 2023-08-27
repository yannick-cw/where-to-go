from flask import Flask, request, Response
import requests

app = Flask(__name__)

# Replace with the target URL where the images are hosted
TARGET_HOST = "https://heatmap-external-a.strava.com"

@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE"])
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE"])
def proxy(path):
    target_url = f"{TARGET_HOST}/{path}"
    headers = dict(request.headers)
    headers["Host"] = TARGET_HOST.split("//")[1]

    response = requests.request(
        method=request.method,
        url=target_url,
        headers=headers,
        data=request.get_data(),
        stream=True,
    )

    excluded_headers = [
        "content-encoding",
        "content-length",
        "transfer-encoding",
        "connection",
    ]

    resp_headers = [
        (name, value)
        for name, value in response.raw.headers.items()
        if name.lower() not in excluded_headers
    ]
    # Set CORS headers to allow requests from any origin
    resp_headers.append(("Access-Control-Allow-Origin", "*"))
    return Response(response.iter_content(chunk_size=8192), headers=resp_headers)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)

