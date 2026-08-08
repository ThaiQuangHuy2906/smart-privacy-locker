'use strict';

// Copy the relevant block into the deployment settings.js. Secrets stay in
// deployment environment variables; they are never embedded in flows.json.
module.exports = {
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET,
  httpStatic: require('node:path').resolve(__dirname, '..', 'dashboard'),
  httpStaticRoot: '/phase2',
  functionGlobalContext: {
    splRuntimeFactory: require('./lib/runtime').createFromEnvironment,
  },
};
