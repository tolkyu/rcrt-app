pm.test('the response names the deleted draft', () => {
  pm.expect(pm.response.json()).to.deep.equal({
    id: pm.collectionVariables.get('vacancy_draft_id'),
  });
});
