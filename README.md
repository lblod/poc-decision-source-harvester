# poc-decision-source-harvester
Proof of concept that harvests local decision using linked traversal

# Install

We use the NPM package `http-server` to run the harvester application:
```
npm install
npm install --global http-server
```

# Build

```
npm run build
```

Now, you need to rebuild the app each time you want to test a specific `interestedMunicipality`.


# Run

```
http-server --cors
```

Go to `http://127.0.0.1:8081/dist/` and check out the console where you should see the harvesting progress
