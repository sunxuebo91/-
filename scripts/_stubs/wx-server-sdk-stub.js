
module.exports = {
  DYNAMIC_CURRENT_ENV: 'dynamic',
  init: () => {},
  database: () => ({
    command: {},
    serverDate: () => new Date(),
    collection: () => ({ doc: () => ({ get: async () => ({}), update: async () => ({}) }), add: async () => ({ _id: 'x' }) }),
    createCollection: async () => {},
  }),
};
