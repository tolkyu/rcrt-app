pm.test('the response names the deleted cancelled draft', () => {
  pm.expect(pm.response.json()).to.deep.equal({
    id: pm.collectionVariables.get('vacancy_cancel_id'),
  });
});
