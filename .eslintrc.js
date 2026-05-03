module.exports = {
  extends: ['athom'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2020: true,
  },
  ignorePatterns: ['.homeybuild/', 'node_modules/', 'modbus-test/'],
};
