pm.test('throwaway position C is inactive', () => {
  pm.expect(pm.response.json().isActive).to.equal(false);
});
