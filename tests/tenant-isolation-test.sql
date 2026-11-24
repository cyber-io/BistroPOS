-- ============================================================
-- BistroPOS - Automated RLS & Tenant Isolation Test
-- Verifies Section 23: Mandatory Two-Restaurant Security Test
-- ============================================================

-- Function to execute test assertions
create or replace function public.run_tenant_isolation_tests()
returns table (test_name text, status text, details text)
language plpgsql
as $$
declare
  v_count integer;
  v_error text;
begin
  -- ----------------------------------------------------------
  -- Test 1: Manager Rahul (Royal Palace) reads own data
  -- ----------------------------------------------------------
  test_name := 'Test 1: Manager Rahul reading Royal Palace menu items';
  begin
    set local role authenticated;
    set local "request.jwt.claim.sub" to 'aaaaaaaa-1111-1111-1111-111111111111';
    
    select count(*) into v_count
    from public.menu_items
    where restaurant_id = '11111111-1111-1111-1111-111111111111';

    if v_count >= 1 then
      status := 'PASSED';
      details := format('Found %s Royal Palace items under Rahul context.', v_count);
    else
      status := 'FAILED';
      details := 'Rahul could not see his own restaurant menu items.';
    end if;
    return next;
  end;

  -- ----------------------------------------------------------
  -- Test 2: Manager Rahul CANNOT read City Restaurant data (Isolation)
  -- ----------------------------------------------------------
  test_name := 'Test 2: Manager Rahul cross-tenant read attempt on City Restaurant';
  begin
    set local role authenticated;
    set local "request.jwt.claim.sub" to 'aaaaaaaa-1111-1111-1111-111111111111';

    select count(*) into v_count
    from public.menu_items
    where restaurant_id = '22222222-2222-2222-2222-222222222222';

    if v_count = 0 then
      status := 'PASSED';
      details := 'RLS blocked cross-tenant read. Zero rows returned for City Restaurant.';
    else
      status := 'FAILED';
      details := format('Isolation breach: Rahul saw %s rows belonging to City Restaurant!', v_count);
    end if;
    return next;
  end;

  -- ----------------------------------------------------------
  -- Test 3: Manager Rahul CANNOT modify City Restaurant tables
  -- ----------------------------------------------------------
  test_name := 'Test 3: Manager Rahul cross-tenant update attempt on City Restaurant table';
  begin
    set local role authenticated;
    set local "request.jwt.claim.sub" to 'aaaaaaaa-1111-1111-1111-111111111111';

    update public.dining_tables
    set capacity = 99
    where restaurant_id = '22222222-2222-2222-2222-222222222222';

    get diagnostics v_count = row_count;

    if v_count = 0 then
      status := 'PASSED';
      details := 'RLS blocked cross-tenant update. Zero rows affected.';
    else
      status := 'FAILED';
      details := format('Isolation breach: Rahul updated %s rows of City Restaurant!', v_count);
    end if;
    return next;
  end;

  -- ----------------------------------------------------------
  -- Test 4: Manager Rahul CANNOT create staff for City Restaurant
  -- ----------------------------------------------------------
  test_name := 'Test 4: Manager Rahul attempting to create staff for City Restaurant';
  begin
    set local role authenticated;
    set local "request.jwt.claim.sub" to 'aaaaaaaa-1111-1111-1111-111111111111';

    insert into public.staff_profiles (user_id, auth_user_id, restaurant_id, name, role)
    values (gen_random_uuid(), gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Rogue Waiter', 'WAITER');

    status := 'FAILED';
    details := 'Manager was able to insert staff into another restaurant!';
    return next;
  exception when others then
    status := 'PASSED';
    details := 'Insert rejected by RLS / constraint: ' || sqlerrm;
    return next;
  end;

  -- ----------------------------------------------------------
  -- Test 5: Manager Rahul CANNOT create a MANAGER or SUPER_ADMIN
  -- ----------------------------------------------------------
  test_name := 'Test 5: Manager Rahul attempting privilege escalation (create MANAGER)';
  begin
    set local role authenticated;
    set local "request.jwt.claim.sub" to 'aaaaaaaa-1111-1111-1111-111111111111';

    insert into public.staff_profiles (user_id, auth_user_id, restaurant_id, name, role)
    values (gen_random_uuid(), gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Escalated Manager', 'MANAGER');

    status := 'FAILED';
    details := 'Manager was able to create another MANAGER without Super Admin!';
    return next;
  exception when others then
    status := 'PASSED';
    details := 'Privilege escalation blocked: ' || sqlerrm;
    return next;
  end;

  -- ----------------------------------------------------------
  -- Test 6: Super Admin can read data across all restaurants
  -- ----------------------------------------------------------
  test_name := 'Test 6: Super Admin cross-tenant visibility';
  begin
    set local role authenticated;
    set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000001';

    select count(*) into v_count from public.restaurants;

    if v_count >= 2 then
      status := 'PASSED';
      details := format('Super Admin can access all %s restaurants.', v_count);
    else
      status := 'FAILED';
      details := format('Super Admin only saw %s restaurants.', v_count);
    end if;
    return next;
  end;

  -- ----------------------------------------------------------
  -- Test 7: Manager Amit (City Restaurant) sees only City Restaurant
  -- ----------------------------------------------------------
  test_name := 'Test 7: Manager Amit independent tenant isolation';
  begin
    set local role authenticated;
    set local "request.jwt.claim.sub" to 'bbbbbbbb-2222-2222-2222-111111111111';

    select count(*) into v_count
    from public.menu_items
    where restaurant_id = '11111111-1111-1111-1111-111111111111';

    if v_count = 0 then
      status := 'PASSED';
      details := 'Amit cannot see Royal Palace menu items.';
    else
      status := 'FAILED';
      details := 'Amit was able to see Royal Palace data!';
    end if;
    return next;
  end;

  reset role;
end;
$$;
