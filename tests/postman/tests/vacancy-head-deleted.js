pm.test('the response names the deleted Head Recruiter draft', () => {
  pm.expect(pm.response.json()).to.deep.equal({
    id: pm.collectionVariables.get('vacancy_head_draft_id'),
  });
});
