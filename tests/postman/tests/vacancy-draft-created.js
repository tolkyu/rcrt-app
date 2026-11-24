const draft = pm.response.json();
pm.test(
  'a draft: no opening date, no position, nobody assigned (Admin is an assigner)',
  () => {
    pm.expect(draft.status).to.equal('DRAFT');
    pm.expect(draft.openedAt).to.equal(null);
    pm.expect(draft.position).to.equal(null);
    pm.expect(draft.recruiters).to.deep.equal([]);
    pm.expect(draft.title).to.equal(
      'Тест API — чернетка ' + pm.collectionVariables.get('vacancy_run'),
    );
    pm.expect(draft.version).to.equal(1);
  },
);
pm.collectionVariables.set('vacancy_draft_id', draft.id);
pm.collectionVariables.set('vacancy_draft_version', draft.version);
