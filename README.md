# poc-decision-source-harvester
Proof of concept that harvests local decision using linked traversal

# Install

We use the NPM package `http-server` to run the harvester application:
```
npm install
npm install --global http-server
```
## Hot reloading
To run with hot reloading. Install the following:
```
npm install --save-dev webpack-dev-server    
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

## Hot-reloading
Hot-reloading with webpack-dev-server is implemented. You can run using the following:
```
npm run start:dev
```
