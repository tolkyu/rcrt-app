const content = pm.response.json();
pm.test('only canonical content and revision metadata are returned', () => {
  pm.expect(Object.keys(content).sort()).to.deep.equal([
    'descriptionDoc',
    'id',
    'requirementsDoc',
    'updatedAt',
    'version',
  ]);
  pm.expect(content.version).to.equal(
    Number(pm.collectionVariables.get('vacancy_content_version')) + 1,
  );
  pm.expect(content.descriptionDoc.content[0].content[0].text).to.equal(
    'Content API replacement',
  );
  pm.expect(content.requirementsDoc).to.equal(null);
});
pm.collectionVariables.set('vacancy_content_version', content.version);
