const vacancy = pm.response.json();
pm.test(
  'cancelled: no action left, the reason comes back, one version bump',
  () => {
    pm.expect(vacancy.status).to.equal('CANCELLED');
    pm.expect(vacancy.statusActions).to.deep.equal([]);
    pm.expect(vacancy.cancelReason).to.equal(
      'Потреба закрита\nТест API ' + pm.collectionVariables.get('vacancy_run'),
    );
    pm.expect(vacancy.version).to.equal(
      Number(pm.collectionVariables.get('team_g_version')) + 1,
    );
  },
);
pm.collectionVariables.set('team_g_version', vacancy.version);
