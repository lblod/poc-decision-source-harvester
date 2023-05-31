# poc-decision-source-harvester
Proof of concept that harvests local decision using linked traversal

# Install

We use the NPM package `http-server` to run the harvester application:
```
npm install
npm install --global http-server
```

# Run

```
cd dist/
http-server --cors
```

Go to `http://127.0.0.1:8080/dist/` and check out the console where you should see the harvesting progress
