pm.test('the requested record', () => {
  pm.expect(pm.response.json().id).to.equal(
    pm.collectionVariables.get('audit_record_id'),
  );
});
