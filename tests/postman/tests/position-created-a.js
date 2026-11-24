const p = pm.response.json();
pm.test('created active at version 1 in the Head Recruiter vertical', () => {
  pm.expect(p.verticalId).to.equal(
    pm.collectionVariables.get('position_gambling_vertical_id'),
  );
  pm.expect(p.name).to.equal(
    'Тест API ' + pm.collectionVariables.get('position_run') + ' A',
  );
  pm.expect(p.isActive).to.equal(true);
  pm.expect(p.version).to.equal(1);
  pm.expect(p.openVacanciesCount).to.equal(null);
});
pm.collectionVariables.set('position_a_id', p.id);
pm.collectionVariables.set('position_a_version', p.version);
