/**
 * 宝贝日记服务（云函数）
 */

function call(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'babyDiaryService',
    data: { action, ...data }
  }).then(res => {
    const result = res?.result;
    if (result?.success) return result;
    const msg = result?.errMsg || res?.errMsg || '云函数调用失败';
    return Promise.reject(new Error(msg));
  });
}

function listContracts(params = {}) {
  return call('listContracts', params);
}

function getContract(id) {
  return call('getContract', { id });
}

function createContract(data) {
  return call('createContract', { data });
}

function updateContract(id, data) {
  return call('updateContract', { id, data });
}

function listDiaries(params = {}) {
  return call('listDiaries', params);
}

function getDiary(params = {}) {
  return call('getDiary', params);
}

function createDiary(contractId, serviceDate, data, status) {
  return call('createDiary', { contractId, serviceDate, data, status });
}

function updateDiary(id, data, status) {
  return call('updateDiary', { id, data, status });
}

function deleteDiary(id) {
  return call('deleteDiary', { id });
}

function getDiaryStats(contractId) {
  return call('getDiaryStats', { contractId });
}

module.exports = {
  listContracts,
  getContract,
  createContract,
  updateContract,
  listDiaries,
  getDiary,
  createDiary,
  updateDiary,
  deleteDiary,
  getDiaryStats,
};
