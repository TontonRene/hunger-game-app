const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclut le dossier backend du bundling React Native
config.watchFolders = [__dirname];
config.resolver.blockList = [
  new RegExp(path.resolve(__dirname, 'backend') + '/.*'),
];

module.exports = config;
