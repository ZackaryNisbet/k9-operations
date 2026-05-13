-- CSR Team Readiness Board
-- Seeds the CSR readiness template from CSR Training.xlsx and imports workbook
-- trainee progress into the same canonical training record tables used by PCT.

CREATE OR REPLACE FUNCTION public.recalculate_training_readiness_record(
  p_record_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS public.training_records
LANGUAGE plpgsql
AS $$
DECLARE
  v_record public.training_records%ROWTYPE;
  v_required_total integer := 0;
  v_required_done integer := 0;
  v_new_percent numeric(5,2) := 0;
  v_new_overall_status public.training_record_status := 'not_started';
BEGIN
  SELECT *
  INTO v_record
  FROM public.training_records
  WHERE id = p_record_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training record % not found', p_record_id;
  END IF;

  SELECT COUNT(*)
  INTO v_required_total
  FROM public.training_template_items item
  JOIN public.training_record_item_results result ON result.template_item_id = item.id
  WHERE result.record_id = p_record_id
    AND item.required = true;

  SELECT COUNT(*)
  INTO v_required_done
  FROM public.training_template_items item
  JOIN public.training_record_item_results result ON result.template_item_id = item.id
  WHERE result.record_id = p_record_id
    AND item.required = true
    AND COALESCE(result.metadata->>'readiness_status', result.metadata->>'pct_readiness_status', CASE
      WHEN result.status IN ('complete', 'passed') THEN 'verified'
      WHEN result.status = 'in_progress' THEN 'demonstrated'
      ELSE result.status::text
    END) IN ('verified', 'waived');

  IF v_required_total > 0 THEN
    v_new_percent := ROUND((v_required_done::numeric / v_required_total::numeric) * 100, 2);
  END IF;

  IF v_required_done = 0 THEN
    v_new_overall_status := 'not_started';
  ELSIF v_required_done >= v_required_total AND v_required_total > 0 THEN
    v_new_overall_status := 'complete';
  ELSE
    v_new_overall_status := 'in_progress';
  END IF;

  UPDATE public.training_records
  SET
    progress_percent = v_new_percent,
    required_item_count = v_required_total,
    required_item_completed_count = v_required_done,
    overall_status = v_new_overall_status,
    actual_completion_date = CASE WHEN v_new_overall_status = 'complete' THEN COALESCE(actual_completion_date, CURRENT_DATE) ELSE NULL END,
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id),
    updated_at = now()
  WHERE id = p_record_id
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_pct_readiness_record(
  p_record_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS public.training_records
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.recalculate_training_readiness_record(p_record_id, p_actor_user_id);
END;
$$;

DO $$
DECLARE
  v_seed jsonb := $seed${"template":{"id":"fe26283b-3578-5cd5-888a-e8fab248190b","version_id":"17cfb8dc-6d8d-54fa-9837-50e4cd60c357","slug":"csr_team_readiness_board","name":"CSR Team Readiness Board","role_scopes":["csr","customer_service_representative"],"source_seed_key":"csr_training_xlsx_v1","source_packet":"CSR Training.xlsx"},"sections":[{"id":"71362f87-63bc-5f2e-993f-df803fddb671","section_key":"csr_gingr_owners_and_pets","title":"Gingr Owners and Pets","sequence_order":1,"source_row":2,"items":[{"id":"9ceffcd9-53e5-5c45-9406-0411558652d4","item_key":"csr_gingr_owners_and_pets_001_create_a_new_owner_profile_with_one_dog","label":"Create a new owner profile with one dog","normalized_label":"create a new owner profile with one dog","sequence_order":1,"source_sheet":"Original Copy","source_row":3,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Create a new owner profile with one dog"}},{"id":"19faef4f-2ec3-53ea-965b-a996ed7d26c5","item_key":"csr_gingr_owners_and_pets_002_create_an_owner_profile_with_multiple_dogs","label":"Create an owner profile with multiple dogs","normalized_label":"create an owner profile with multiple dogs","sequence_order":2,"source_sheet":"Original Copy","source_row":4,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Create an owner profile with multiple dogs"}},{"id":"cca46a58-2a00-5a62-a2ec-0e457f8721aa","item_key":"csr_gingr_owners_and_pets_003_search_for_an_owner_profile","label":"Search for an owner profile","normalized_label":"search for an owner profile","sequence_order":3,"source_sheet":"Original Copy","source_row":5,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Search for an owner profile"}},{"id":"977bfaed-299f-54f1-aede-83c99a09048c","item_key":"csr_gingr_owners_and_pets_004_change_an_owner_s_information_ex_address_phone","label":"Change an owner's information (ex. address, phone number)","normalized_label":"change an owner s information ex address phone number","sequence_order":4,"source_sheet":"Original Copy","source_row":6,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Change an owner's information (ex. address, phone number)"}},{"id":"c13e320d-c46c-53e4-a516-d6dbe8e5373a","item_key":"csr_gingr_owners_and_pets_005_update_a_dog_s_information_change_birthday_vet","label":"Update a dog's information (change birthday, veterinarian, allergies, altered status)","normalized_label":"update a dog s information change birthday veterinarian allergies altered status","sequence_order":5,"source_sheet":"Original Copy","source_row":7,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Update a dog's information (change birthday, veterinarian, allergies, altered status)"}},{"id":"0465c0bd-ef4c-5a21-ab07-ac26b71768fe","item_key":"csr_gingr_owners_and_pets_006_update_a_dog_s_vaccine_info_how_to_update_immu","label":"Update a dog's vaccine info (how to update immunizations tab or shield, and how to upload file from email etc to owner's account)","normalized_label":"update a dog s vaccine info how to update immunizations tab or shield and how to upload file from email etc to owner s account","sequence_order":6,"source_sheet":"Original Copy","source_row":8,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Update a dog's vaccine info (how to update immunizations tab or shield, and how to upload file from email etc to owner's account)"}},{"id":"4ae023dd-d49b-570c-9e44-3ce79f493f9d","item_key":"csr_gingr_owners_and_pets_007_adding_icons_to_a_dogs_account","label":"Adding icons to a dogs account","normalized_label":"adding icons to a dogs account","sequence_order":7,"source_sheet":"Original Copy","source_row":9,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Adding icons to a dogs account"}},{"id":"77191deb-d251-54b9-8754-f93c866288a6","item_key":"csr_gingr_owners_and_pets_008_adding_owner_notes_to_a_gingr_profile","label":"Adding owner notes to a gingr profile","normalized_label":"adding owner notes to a gingr profile","sequence_order":8,"source_sheet":"Original Copy","source_row":10,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Adding owner notes to a gingr profile"}},{"id":"4cfdbabd-b0a9-5f7e-8508-b7fc5e1a233e","item_key":"csr_gingr_owners_and_pets_009_adding_dog_notes_to_a_gingr_profile_copying_a","label":"Adding dog notes to a gingr profile (copying a pasting from EOD and marking it off in the EOD as input on gingr, or putting notes in after verbally speaking to client as it relates to the dog)","normalized_label":"adding dog notes to a gingr profile copying a pasting from eod and marking it off in the eod as input on gingr or putting notes in after verbally speaking to client as it relates to the dog","sequence_order":9,"source_sheet":"Original Copy","source_row":11,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Adding dog notes to a gingr profile (copying a pasting from EOD and marking it off in the EOD as input on gingr, or putting notes in after verbally speaking to client as it relates to the dog)"}},{"id":"656e8c25-4051-50ab-aedf-9e7f2bfd6723","item_key":"csr_gingr_owners_and_pets_010_push_agreements_to_device","label":"Push agreements to device","normalized_label":"push agreements to device","sequence_order":10,"source_sheet":"Original Copy","source_row":12,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Push agreements to device"}},{"id":"9eee553d-284c-5ae1-bd74-c16f8de59015","item_key":"csr_gingr_owners_and_pets_011_locate_reservations_under_the_owner_or_if_mult","label":"Locate reservations under the owner or if multiple dogs for a specific dog as well (future, past, present)","normalized_label":"locate reservations under the owner or if multiple dogs for a specific dog as well future past present","sequence_order":11,"source_sheet":"Original Copy","source_row":13,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Locate reservations under the owner or if multiple dogs for a specific dog as well (future, past, present)"}},{"id":"cda8b23b-6546-5efe-a7fe-1daba1518cce","item_key":"csr_gingr_owners_and_pets_012_deduct_package_credit_manually","label":"Deduct package credit manually","normalized_label":"deduct package credit manually","sequence_order":12,"source_sheet":"Original Copy","source_row":14,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Deduct package credit manually"}},{"id":"905ab21c-d74f-50cc-9a0a-6807c1f045d1","item_key":"csr_gingr_owners_and_pets_013_view_invoice_history","label":"View invoice history","normalized_label":"view invoice history","sequence_order":13,"source_sheet":"Original Copy","source_row":15,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"View invoice history"}},{"id":"8dd04bed-6710-55c7-a885-f703ade0f8c1","item_key":"csr_gingr_owners_and_pets_014_locate_reservation_requests_and_learning_how_t","label":"Locate reservation requests and learning how to accept or reject properly (for daycare verifiyng numbers to make sure we have room for dates requested, for boaridng verifiying and building entire reservation before hitting accept, for rejection making sure we are calling and notifying client as well)","normalized_label":"locate reservation requests and learning how to accept or reject properly for daycare verifiyng numbers to make sure we have room for dates requested for boaridng verifiying and building entire reservation before hitting accept for rejection making sure we are calling and notifying client as well","sequence_order":14,"source_sheet":"Original Copy","source_row":16,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Locate reservation requests and learning how to accept or reject properly (for daycare verifiyng numbers to make sure we have room for dates requested, for boaridng verifiying and building entire reservation before hitting accept, for rejection making sure we are calling and notifying client as well)"}},{"id":"9bdb2bc9-52d4-5601-a572-63a9861c8f1d","item_key":"csr_gingr_owners_and_pets_015_can_differentiate_between_icons","label":"Can differentiate between icons","normalized_label":"can differentiate between icons","sequence_order":15,"source_sheet":"Original Copy","source_row":17,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Can differentiate between icons"}}]},{"id":"6629161f-da20-5a41-93ff-4b5aed4686eb","section_key":"csr_gingr_shopping_cart","title":"Gingr Shopping Cart","sequence_order":2,"source_row":19,"items":[{"id":"3d44aaac-f369-5990-9caf-acd12ce22e30","item_key":"csr_gingr_shopping_cart_001_purchase_store_credit_for_an_owner_through_sho","label":"Purchase store credit for an owner (through shopping cart and also through the owner profile)","normalized_label":"purchase store credit for an owner through shopping cart and also through the owner profile","sequence_order":1,"source_sheet":"Original Copy","source_row":20,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Purchase store credit for an owner (through shopping cart and also through the owner profile)"}},{"id":"19d26a63-a612-5620-a99b-9a0a685046f5","item_key":"csr_gingr_shopping_cart_002_purchase_gift_certificate","label":"Purchase gift certificate","normalized_label":"purchase gift certificate","sequence_order":2,"source_sheet":"Original Copy","source_row":21,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Purchase gift certificate"}},{"id":"b276c45e-fb13-5296-b8ee-3798fed8e936","item_key":"csr_gingr_shopping_cart_003_process_a_refund","label":"Process a refund","normalized_label":"process a refund","sequence_order":3,"source_sheet":"Original Copy","source_row":22,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Process a refund"}},{"id":"ec5dbdd9-d5a4-5bce-ae34-3a47f6bf34e7","item_key":"csr_gingr_shopping_cart_004_apply_discounts_properly","label":"Apply discounts properly","normalized_label":"apply discounts properly","sequence_order":4,"source_sheet":"Original Copy","source_row":23,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Apply discounts properly"}},{"id":"8bac71f7-a616-5a9e-9eab-3312f1584fa3","item_key":"csr_gingr_shopping_cart_005_check_out_using_daycare_package","label":"Check out using daycare package","normalized_label":"check out using daycare package","sequence_order":5,"source_sheet":"Original Copy","source_row":24,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Check out using daycare package"}},{"id":"77f47809-ea15-5892-aa01-24edf6b2edbf","item_key":"csr_gingr_shopping_cart_006_checkout_boarding_dog","label":"Checkout boarding dog","normalized_label":"checkout boarding dog","sequence_order":6,"source_sheet":"Original Copy","source_row":25,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Checkout boarding dog"}},{"id":"7b418f9b-891d-545e-81df-31c3b71fee7b","item_key":"csr_gingr_shopping_cart_007_when_checking_out_dogs_making_sure_to_check_eo","label":"When checking out dogs making sure to check EOD doc for any notes throughout the day/boarding stay. Relaying to owners and initialing EOD doc properly","normalized_label":"when checking out dogs making sure to check eod doc for any notes throughout the day boarding stay relaying to owners and initialing eod doc properly","sequence_order":7,"source_sheet":"Original Copy","source_row":26,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"When checking out dogs making sure to check EOD doc for any notes throughout the day/boarding stay. Relaying to owners and initialing EOD doc properly"}}]},{"id":"13a52acc-75d4-5dd8-acde-f5ed5857a7a3","section_key":"csr_gingr_point_of_sale","title":"Gingr Point of Sale","sequence_order":3,"source_row":28,"items":[{"id":"05e97c41-fb83-554f-a63a-0c91b3b20d08","item_key":"csr_gingr_point_of_sale_001_purchase_a_dc_package","label":"Purchase a dc package","normalized_label":"purchase a dc package","sequence_order":1,"source_sheet":"Original Copy","source_row":29,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Purchase a dc package"}},{"id":"118e2041-f8da-5f34-80cc-012b08c9ec14","item_key":"csr_gingr_point_of_sale_002_purchase_a_boaridng_package","label":"Purchase a boaridng package","normalized_label":"purchase a boaridng package","sequence_order":2,"source_sheet":"Original Copy","source_row":30,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Purchase a boaridng package"}},{"id":"91c863bb-3023-52fc-a61b-8dc2fa985033","item_key":"csr_gingr_point_of_sale_003_how_to_purchase_free_day_of_dc_free_bath_etc","label":"How to purchase free day of dc, free bath, etc","normalized_label":"how to purchase free day of dc free bath etc","sequence_order":3,"source_sheet":"Original Copy","source_row":31,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to purchase free day of dc, free bath, etc"}}]},{"id":"6e8e3cd1-886e-5f69-ac77-c662a407946a","section_key":"csr_making_reservations_on_gingr","title":"Making Reservations on Gingr","sequence_order":4,"source_row":33,"items":[{"id":"3d53810f-5c82-54b8-a6dc-804dc1a5f61e","item_key":"csr_making_reservations_on_gingr_001_creating_a_5_day_boaridng_stay_in_a_lux_room_a","label":"Creating a 5 day boaridng stay in a lux room, adding a bath with an 11:30 p/u time, house food chicken, reviewing estimate (making client aware of peak prices any additional fees they may not be expecting that are not for a service or rate of the room) and collecting 50% deposit.","normalized_label":"creating a 5 day boaridng stay in a lux room adding a bath with an 11 30 p u time house food chicken reviewing estimate making client aware of peak prices any additional fees they may not be expecting that are not for a service or rate of the room and collecting 50 deposit","sequence_order":1,"source_sheet":"Original Copy","source_row":34,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Creating a 5 day boaridng stay in a lux room, adding a bath with an 11:30 p/u time, house food chicken, reviewing estimate (making client aware of peak prices any additional fees they may not be expecting that are not for a service or rate of the room) and collecting 50% deposit."}},{"id":"448b5e51-f658-5402-b393-4a5ba2c1c71b","item_key":"csr_making_reservations_on_gingr_002_creating_a_7_day_boarding_stay_in_an_exec_for","label":"Creating a 7 day boarding stay in an exec for two dogs in the same room, both need bath, both are bagged ffh, both getting ice cream, review and collecting deposit)","normalized_label":"creating a 7 day boarding stay in an exec for two dogs in the same room both need bath both are bagged ffh both getting ice cream review and collecting deposit","sequence_order":2,"source_sheet":"Original Copy","source_row":35,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Creating a 7 day boarding stay in an exec for two dogs in the same room, both need bath, both are bagged ffh, both getting ice cream, review and collecting deposit)"}},{"id":"3b7ef826-7537-5df6-88d3-6686a73c63fa","item_key":"csr_making_reservations_on_gingr_003_create_a_3_day_boarding_stay_in_compartments_w","label":"Create a 3 day boarding stay in compartments with a bath, ffh unbagged","normalized_label":"create a 3 day boarding stay in compartments with a bath ffh unbagged","sequence_order":3,"source_sheet":"Original Copy","source_row":36,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Create a 3 day boarding stay in compartments with a bath, ffh unbagged"}},{"id":"f29fc00f-ce8c-5ed9-9de3-308fb550fda4","item_key":"csr_making_reservations_on_gingr_004_shorten_a_reservation_ensuring_all_steps_taken","label":"shorten a reservation (ensuring all steps taken properly on gingr and services/charges are properly adjusted, as well as notifying supervisor so the back end and make necessary changes)","normalized_label":"shorten a reservation ensuring all steps taken properly on gingr and services charges are properly adjusted as well as notifying supervisor so the back end and make necessary changes","sequence_order":4,"source_sheet":"Original Copy","source_row":37,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"shorten a reservation (ensuring all steps taken properly on gingr and services/charges are properly adjusted, as well as notifying supervisor so the back end and make necessary changes)"}},{"id":"d747e449-2808-55e1-9e4c-bc952c7ba1cb","item_key":"csr_making_reservations_on_gingr_005_extend_a_reservation_ensuring_all_steps_taken","label":"Extend a reservation (ensuring all steps taken properly on gingr and services/charges are properly adjusts, as well as notifying supervisor so the back end and make necessary changes)","normalized_label":"extend a reservation ensuring all steps taken properly on gingr and services charges are properly adjusts as well as notifying supervisor so the back end and make necessary changes","sequence_order":5,"source_sheet":"Original Copy","source_row":38,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Extend a reservation (ensuring all steps taken properly on gingr and services/charges are properly adjusts, as well as notifying supervisor so the back end and make necessary changes)"}},{"id":"1a707535-123d-55d8-816b-6d06bdc385c5","item_key":"csr_making_reservations_on_gingr_006_cancel_a_reservation_and_forfeit_the_the_depos","label":"Cancel a reservation and forfeit the the deposit, apply forfeited amount as store credit","normalized_label":"cancel a reservation and forfeit the the deposit apply forfeited amount as store credit","sequence_order":6,"source_sheet":"Original Copy","source_row":39,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Cancel a reservation and forfeit the the deposit, apply forfeited amount as store credit"}},{"id":"7127e939-8367-5536-9824-b4eff7996510","item_key":"csr_making_reservations_on_gingr_007_make_a_daycare_reservation","label":"Make a daycare reservation","normalized_label":"make a daycare reservation","sequence_order":7,"source_sheet":"Original Copy","source_row":40,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Make a daycare reservation"}},{"id":"2ebd3e1c-f979-5bab-8a1f-2a66f53978d2","item_key":"csr_making_reservations_on_gingr_008_making_a_reservation_for_a_dog_that_has_not_be","label":"Making a reservation for a dog that has not been here in 6 months with bad notes, or a dog who has not been here in 1 year (making sure vax are updated and verify that they need to be re-evaled for group)","normalized_label":"making a reservation for a dog that has not been here in 6 months with bad notes or a dog who has not been here in 1 year making sure vax are updated and verify that they need to be re evaled for group","sequence_order":8,"source_sheet":"Original Copy","source_row":41,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Making a reservation for a dog that has not been here in 6 months with bad notes, or a dog who has not been here in 1 year (making sure vax are updated and verify that they need to be re-evaled for group)"}},{"id":"c9ef688d-22c8-598c-b6d3-b979bdf43c54","item_key":"csr_making_reservations_on_gingr_009_make_a_daycare_reservation_for_reoccuring_date","label":"Make a daycare reservation for reoccuring dates","normalized_label":"make a daycare reservation for reoccuring dates","sequence_order":9,"source_sheet":"Original Copy","source_row":42,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Make a daycare reservation for reoccuring dates"}},{"id":"b2f7de34-3030-5c32-bd14-6eca59965d92","item_key":"csr_making_reservations_on_gingr_010_make_multiple_daycare_reservations_at_once","label":"Make multiple daycare reservations at once","normalized_label":"make multiple daycare reservations at once","sequence_order":10,"source_sheet":"Original Copy","source_row":43,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Make multiple daycare reservations at once"}},{"id":"ea68f078-85ed-554d-a962-5580ca3388fd","item_key":"csr_making_reservations_on_gingr_011_make_a_dayboaridng_reservation","label":"Make a dayboaridng reservation","normalized_label":"make a dayboaridng reservation","sequence_order":11,"source_sheet":"Original Copy","source_row":44,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Make a dayboaridng reservation"}}]},{"id":"9d055510-f12f-55eb-b575-0418f465d45b","section_key":"csr_gingr_dashboard","title":"Gingr Dashboard","sequence_order":5,"source_row":46,"items":[{"id":"463bf146-d138-509b-9e2f-49f947a04166","item_key":"csr_gingr_dashboard_001_check_in_a_dog_for_a_full_day_of_dc","label":"Check in a dog for a full day of dc","normalized_label":"check in a dog for a full day of dc","sequence_order":1,"source_sheet":"Original Copy","source_row":47,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Check in a dog for a full day of dc"}},{"id":"a78c5399-3267-59da-bd12-93bb26576b89","item_key":"csr_gingr_dashboard_002_check_in_a_dog_for_a_half_day_of_dc","label":"Check in a dog for a half day of dc","normalized_label":"check in a dog for a half day of dc","sequence_order":2,"source_sheet":"Original Copy","source_row":48,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Check in a dog for a half day of dc"}},{"id":"a4695016-ec77-50b1-b809-5d902b49c25f","item_key":"csr_gingr_dashboard_003_check_in_a_dog_for_dayboarding_grabbing_collar","label":"Check in a dog for dayboarding (grabbing collar, laminated run card, or printing run card and writing dayboaridng and highlighting properly)","normalized_label":"check in a dog for dayboarding grabbing collar laminated run card or printing run card and writing dayboaridng and highlighting properly","sequence_order":3,"source_sheet":"Original Copy","source_row":49,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Check in a dog for dayboarding (grabbing collar, laminated run card, or printing run card and writing dayboaridng and highlighting properly)"}},{"id":"ecc0c5d6-f2e5-5ead-bbf6-d3579ebe9aa4","item_key":"csr_gingr_dashboard_004_check_in_a_dog_for_boaridng_asking_client_all","label":"Check in a dog for boaridng (asking client all check-in questions and writing EVERYTHING we need to know about the dog's reservation on the check in sheet, confirming everything we have in gingr is accurate)","normalized_label":"check in a dog for boaridng asking client all check in questions and writing everything we need to know about the dog s reservation on the check in sheet confirming everything we have in gingr is accurate","sequence_order":4,"source_sheet":"Original Copy","source_row":50,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Check in a dog for boaridng (asking client all check-in questions and writing EVERYTHING we need to know about the dog's reservation on the check in sheet, confirming everything we have in gingr is accurate)"}},{"id":"7732c584-340a-5e68-bb34-81d6f16ce72f","item_key":"csr_gingr_dashboard_005_highlighting_run_card_properly_and_notating_im","label":"Highlighting run card properly and notating important information on run cards when doing boaridng check ins","normalized_label":"highlighting run card properly and notating important information on run cards when doing boaridng check ins","sequence_order":5,"source_sheet":"Original Copy","source_row":51,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Highlighting run card properly and notating important information on run cards when doing boaridng check ins"}},{"id":"1d1baec6-ff46-56d5-98f7-63eba3f10545","item_key":"csr_gingr_dashboard_006_add_services_to_a_dog_that_is_already_checked","label":"Add services to a dog that is already checked in (dc bath, enrichment, etc)","normalized_label":"add services to a dog that is already checked in dc bath enrichment etc","sequence_order":6,"source_sheet":"Original Copy","source_row":52,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Add services to a dog that is already checked in (dc bath, enrichment, etc)"}},{"id":"81ab4ea7-7891-56fd-b772-e66fc659cea9","item_key":"csr_gingr_dashboard_007_turn_a_daycare_reservation_into_a_boarding_res","label":"Turn a daycare reservation into a boarding reservation (for exmaple Boots' owners called back and need to keep her overnight make sure everything in system is updated accordingly, deposit is still taken, collar updated, SUP notified)","normalized_label":"turn a daycare reservation into a boarding reservation for exmaple boots owners called back and need to keep her overnight make sure everything in system is updated accordingly deposit is still taken collar updated sup notified","sequence_order":7,"source_sheet":"Original Copy","source_row":53,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Turn a daycare reservation into a boarding reservation (for exmaple Boots' owners called back and need to keep her overnight make sure everything in system is updated accordingly, deposit is still taken, collar updated, SUP notified)"}},{"id":"73b2ddfd-1284-571f-af81-3620fa235585","item_key":"csr_gingr_dashboard_008_add_an_owner_icon","label":"Add an owner icon","normalized_label":"add an owner icon","sequence_order":8,"source_sheet":"Original Copy","source_row":54,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Add an owner icon"}},{"id":"a3c0873a-8e6e-507d-9841-c592b1a741d0","item_key":"csr_gingr_dashboard_009_view_lodging_calendar_and_can_understand_how_t","label":"View lodging calendar and can understand how to read it","normalized_label":"view lodging calendar and can understand how to read it","sequence_order":9,"source_sheet":"Original Copy","source_row":55,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"View lodging calendar and can understand how to read it"}},{"id":"29b4aae1-e177-54ef-91e5-59452cdbe95f","item_key":"csr_gingr_dashboard_010_view_facility_calendar_understand_how_to_read","label":"View facility calendar, understand how to read it, when to use it","normalized_label":"view facility calendar understand how to read it when to use it","sequence_order":10,"source_sheet":"Original Copy","source_row":56,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"View facility calendar, understand how to read it, when to use it"}},{"id":"83095154-2dbb-5750-a323-f0d483598670","item_key":"csr_gingr_dashboard_011_knows_how_to_view_all_owners","label":"Knows how to \"view all owners\"","normalized_label":"knows how to view all owners","sequence_order":11,"source_sheet":"Original Copy","source_row":57,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Knows how to \"view all owners\""}},{"id":"60534c19-f48c-57c9-b36f-40f26be59247","item_key":"csr_gingr_dashboard_012_knows_how_to_search_checked_in_expected_going","label":"Knows how to search \"checked in/expected/going home\" on gingr by icon","normalized_label":"knows how to search checked in expected going home on gingr by icon","sequence_order":12,"source_sheet":"Original Copy","source_row":58,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Knows how to search \"checked in/expected/going home\" on gingr by icon"}}]},{"id":"291dc8b9-82f9-5f56-be6d-bb00e4ab0237","section_key":"csr_reports","title":"Reports","sequence_order":6,"source_row":60,"items":[{"id":"734f3c67-c726-5fd1-a344-270b19cb22a1","item_key":"csr_reports_001_lodging_transfer_report_in_the_am_printing_and","label":"Lodging Transfer Report (in the AM printing and making new collars, in afternoon getting lodging transfers set up for the next day and making new collars)","normalized_label":"lodging transfer report in the am printing and making new collars in afternoon getting lodging transfers set up for the next day and making new collars","sequence_order":1,"source_sheet":"Original Copy","source_row":61,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Lodging Transfer Report (in the AM printing and making new collars, in afternoon getting lodging transfers set up for the next day and making new collars)"}},{"id":"d25c779b-397b-5d14-8204-84c78af3ad0a","item_key":"csr_reports_002_missing_lodgings_sometimes_requests_that_have","label":"Missing Lodgings (sometimes requests that have not been worked on yet will show up in this report, knows how to fix)","normalized_label":"missing lodgings sometimes requests that have not been worked on yet will show up in this report knows how to fix","sequence_order":2,"source_sheet":"Original Copy","source_row":62,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Missing Lodgings (sometimes requests that have not been worked on yet will show up in this report, knows how to fix)"}},{"id":"930a7984-a7d9-59ec-a535-b3c1311cc038","item_key":"csr_reports_003_lunch_med_report","label":"Lunch Med report","normalized_label":"lunch med report","sequence_order":3,"source_sheet":"Original Copy","source_row":63,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Lunch Med report"}},{"id":"392b4303-a037-5e3e-8ca5-e2a1ee8f51aa","item_key":"csr_reports_004_lunch_feeidng_report","label":"Lunch Feeidng report","normalized_label":"lunch feeidng report","sequence_order":4,"source_sheet":"Original Copy","source_row":64,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Lunch Feeidng report"}},{"id":"b526626f-1422-5cec-9646-92a40f9d1aa2","item_key":"csr_reports_005_files_reports_for_vax_uploads_in_the_am_review","label":"Files Reports (for vax uploads in the AM review from the night prior to that morning, in the PM just checking things uploaded from current day_","normalized_label":"files reports for vax uploads in the am review from the night prior to that morning in the pm just checking things uploaded from current day","sequence_order":5,"source_sheet":"Original Copy","source_row":65,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Files Reports (for vax uploads in the AM review from the night prior to that morning, in the PM just checking things uploaded from current day_"}},{"id":"9a10c620-b309-5824-a87e-58b41dec20c2","item_key":"csr_reports_006_deposits_check_and_canceled_reservations_pendi","label":"Deposits check (and canceled reservations pending resolution knnows how to resolve)","normalized_label":"deposits check and canceled reservations pending resolution knnows how to resolve","sequence_order":6,"source_sheet":"Original Copy","source_row":66,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Deposits check (and canceled reservations pending resolution knnows how to resolve)"}},{"id":"54b7fb2c-4fe2-5f63-b2ca-df3b045075cb","item_key":"csr_reports_007_expired_vaccine_report_call_vets_email_reminde","label":"Expired Vaccine Report (call vets, email reminders to owner, look at dogs with reservations a week out at least, knows what dates to look at)","normalized_label":"expired vaccine report call vets email reminders to owner look at dogs with reservations a week out at least knows what dates to look at","sequence_order":7,"source_sheet":"Original Copy","source_row":67,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Expired Vaccine Report (call vets, email reminders to owner, look at dogs with reservations a week out at least, knows what dates to look at)"}}]},{"id":"a23079db-5824-5668-836e-b08b0b301d99","section_key":"csr_notes","title":"Notes","sequence_order":7,"source_row":69,"items":[{"id":"6112eea1-339a-550f-8249-945fa3359752","item_key":"csr_notes_001_how_to_input_dogs_first_and_last_name_date_and","label":"How to input (dogs first and last name, date and time and where to put DC dog notes in EOD doc and on gingr (how to notate on eod doc that it was relayed to owner and how to inital it so everyone knows you spoke to them, highlighting it blue after it has been transferred from the EOD doc to the account)","normalized_label":"how to input dogs first and last name date and time and where to put dc dog notes in eod doc and on gingr how to notate on eod doc that it was relayed to owner and how to inital it so everyone knows you spoke to them highlighting it blue after it has been transferred from the eod doc to the account","sequence_order":1,"source_sheet":"Original Copy","source_row":70,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to input (dogs first and last name, date and time and where to put DC dog notes in EOD doc and on gingr (how to notate on eod doc that it was relayed to owner and how to inital it so everyone knows you spoke to them, highlighting it blue after it has been transferred from the EOD doc to the account)"}},{"id":"f6c4e00b-abf0-5e90-9e34-77accfba1ffa","item_key":"csr_notes_002_how_to_input_notes_for_boaridng_dogs_how_it_is","label":"How to input notes for boaridng dogs (how it is organized in EOD doc, how to put them in, when they should be transferred to gingr)","normalized_label":"how to input notes for boaridng dogs how it is organized in eod doc how to put them in when they should be transferred to gingr","sequence_order":2,"source_sheet":"Original Copy","source_row":71,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to input notes for boaridng dogs (how it is organized in EOD doc, how to put them in, when they should be transferred to gingr)"}},{"id":"1e02849f-dbc7-58bb-817f-0049a2777b51","item_key":"csr_notes_003_putting_eval_notes_in_to_the_dogs_profile_upda","label":"Putting eval notes in to the dogs profile, updating flags accordingly, for boarding evals remembering to update collars and run cards appropriately.","normalized_label":"putting eval notes in to the dogs profile updating flags accordingly for boarding evals remembering to update collars and run cards appropriately","sequence_order":3,"source_sheet":"Original Copy","source_row":72,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Putting eval notes in to the dogs profile, updating flags accordingly, for boarding evals remembering to update collars and run cards appropriately."}},{"id":"c0dac0cd-c427-5fe8-8a7f-54d4681790ab","item_key":"csr_notes_004_sick_and_injured_list_notes_whenever_an_owner","label":"Sick and Injured List notes (whenever an owner calls to let us know of any sort of illness or inury related to the dog - add them to the list with a description of what is wrong and the initial date of then you found the info, following up one week later, after 1 follow up remove from eod doc and input into gingr profile","normalized_label":"sick and injured list notes whenever an owner calls to let us know of any sort of illness or inury related to the dog add them to the list with a description of what is wrong and the initial date of then you found the info following up one week later after 1 follow up remove from eod doc and input into gingr profile","sequence_order":4,"source_sheet":"Original Copy","source_row":73,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Sick and Injured List notes (whenever an owner calls to let us know of any sort of illness or inury related to the dog - add them to the list with a description of what is wrong and the initial date of then you found the info, following up one week later, after 1 follow up remove from eod doc and input into gingr profile"}}]},{"id":"2541565c-d99f-5c66-8a84-5445d75ed1aa","section_key":"csr_running_dogs","title":"Running Dogs","sequence_order":8,"source_row":75,"items":[{"id":"1c88883a-b651-5811-a382-5fc398c68ccf","item_key":"csr_running_dogs_001_bringing_dogs_from_lobby_to_dc_making_sure_the","label":"Bringing dogs from lobby to dc - making sure they have a reservation - taking to appropriate daycare - giving them a collar - relaying to dc pct who you have and any important info about the dog that all staff should be aware of","normalized_label":"bringing dogs from lobby to dc making sure they have a reservation taking to appropriate daycare giving them a collar relaying to dc pct who you have and any important info about the dog that all staff should be aware of","sequence_order":1,"source_sheet":"Original Copy","source_row":76,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Bringing dogs from lobby to dc - making sure they have a reservation - taking to appropriate daycare - giving them a collar - relaying to dc pct who you have and any important info about the dog that all staff should be aware of"}},{"id":"3dbc1bc2-5c91-5f82-9d26-d260373060fb","item_key":"csr_running_dogs_002_what_to_do_with_dc_dog_belongings_and_making_s","label":"What to do with dc dog belongings and making sure there stuff is in the right place, writing their name and last initial on the correct whiteboard","normalized_label":"what to do with dc dog belongings and making sure there stuff is in the right place writing their name and last initial on the correct whiteboard","sequence_order":2,"source_sheet":"Original Copy","source_row":77,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"What to do with dc dog belongings and making sure there stuff is in the right place, writing their name and last initial on the correct whiteboard"}},{"id":"ed9f1e58-0194-556f-bad0-367b216ed734","item_key":"csr_running_dogs_003_running_boarding_dogs_to_dc_getting_their_coll","label":"Running boarding dogs to dc - getting their collar from the drawer, doing a full body check, bringing their belongings back up to the front, notating the body check as well as documenting their belongings in the items list section of the body check form","normalized_label":"running boarding dogs to dc getting their collar from the drawer doing a full body check bringing their belongings back up to the front notating the body check as well as documenting their belongings in the items list section of the body check form","sequence_order":3,"source_sheet":"Original Copy","source_row":78,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Running boarding dogs to dc - getting their collar from the drawer, doing a full body check, bringing their belongings back up to the front, notating the body check as well as documenting their belongings in the items list section of the body check form"}},{"id":"3a3d36ed-d44c-5fdd-96a4-820c55dfcb4f","item_key":"csr_running_dogs_004_running_dogs_going_home_from_dc_asking_for_the","label":"Running dogs going home from dc - asking for the dog in the gate over the walkie, ensuring you are grabbing the correct belongings, verifying the collar on the dog and making sure you are grabbing the right dog.","normalized_label":"running dogs going home from dc asking for the dog in the gate over the walkie ensuring you are grabbing the correct belongings verifying the collar on the dog and making sure you are grabbing the right dog","sequence_order":4,"source_sheet":"Original Copy","source_row":79,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Running dogs going home from dc - asking for the dog in the gate over the walkie, ensuring you are grabbing the correct belongings, verifying the collar on the dog and making sure you are grabbing the right dog."}},{"id":"c55f07e3-9473-5c45-8a83-6edf022b5f8a","item_key":"csr_running_dogs_005_running_boarding_dogs_to_go_home_checking_the","label":"Running boarding dogs to go home - checking the departing board and grabbing the right stuff maing sure to read any notes on the board like (food in the fridge, stuff under the sink etc) and remembering if they have a star next to their name they get perfume on the way out, always double checking collars to make sure you have the right dog.","normalized_label":"running boarding dogs to go home checking the departing board and grabbing the right stuff maing sure to read any notes on the board like food in the fridge stuff under the sink etc and remembering if they have a star next to their name they get perfume on the way out always double checking collars to make sure you have the right dog","sequence_order":5,"source_sheet":"Original Copy","source_row":80,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Running boarding dogs to go home - checking the departing board and grabbing the right stuff maing sure to read any notes on the board like (food in the fridge, stuff under the sink etc) and remembering if they have a star next to their name they get perfume on the way out, always double checking collars to make sure you have the right dog."}},{"id":"49cd8e84-6281-5050-b662-5163cfb3a8e1","item_key":"csr_running_dogs_006_bringing_dayboarding_or_pp_boarding_dogs_back","label":"Bringing dayboarding or pp boarding dogs back in the morning - making sure to announce pp dog over walkie, adding to the pp list, and giving the dog water","normalized_label":"bringing dayboarding or pp boarding dogs back in the morning making sure to announce pp dog over walkie adding to the pp list and giving the dog water","sequence_order":6,"source_sheet":"Original Copy","source_row":81,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Bringing dayboarding or pp boarding dogs back in the morning - making sure to announce pp dog over walkie, adding to the pp list, and giving the dog water"}},{"id":"d59cdfd4-9763-5d39-894d-6cd7bc241056","item_key":"csr_running_dogs_007_bringing_dayboarding_dogs_back_up_to_lobby_to","label":"Bringing dayboarding dogs back up to lobby to leave, announcing pp dog, grabbing all of the dogs belongings, crossing them off the pp list","normalized_label":"bringing dayboarding dogs back up to lobby to leave announcing pp dog grabbing all of the dogs belongings crossing them off the pp list","sequence_order":7,"source_sheet":"Original Copy","source_row":82,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Bringing dayboarding dogs back up to lobby to leave, announcing pp dog, grabbing all of the dogs belongings, crossing them off the pp list"}},{"id":"17d060e8-426d-5b45-b088-bfc783ef824d","item_key":"csr_running_dogs_008_bringing_pp_boaridng_dogs_up_to_the_lobby_maki","label":"Bringing PP boaridng dogs up to the lobby - making sure to read any notes (like ffh in the fridge, spray me when i leave, dont forget my toys etc) announcing pp dog over walkie, bringing to lobby","normalized_label":"bringing pp boaridng dogs up to the lobby making sure to read any notes like ffh in the fridge spray me when i leave dont forget my toys etc announcing pp dog over walkie bringing to lobby","sequence_order":8,"source_sheet":"Original Copy","source_row":83,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Bringing PP boaridng dogs up to the lobby - making sure to read any notes (like ffh in the fridge, spray me when i leave, dont forget my toys etc) announcing pp dog over walkie, bringing to lobby"}},{"id":"60269ca6-db4c-53cb-bf2e-852c9ef3fcf5","item_key":"csr_running_dogs_009_running_evaluation_dogs_to_the_back_announcing","label":"Running evaluation dogs to the back (announcing you are bringing an eval dog out to the yard, adding them to the pp list, placing them in a clean room and giving them water, letting SUP know their eval is here and what size group they belong in and any info about prior socialization or things we should know, putting their belongings towards the end of the dc board with (eval) in parenthesess, if they fail moving their belongings from the board to their db room.","normalized_label":"running evaluation dogs to the back announcing you are bringing an eval dog out to the yard adding them to the pp list placing them in a clean room and giving them water letting sup know their eval is here and what size group they belong in and any info about prior socialization or things we should know putting their belongings towards the end of the dc board with eval in parenthesess if they fail moving their belongings from the board to their db room","sequence_order":9,"source_sheet":"Original Copy","source_row":84,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Running evaluation dogs to the back (announcing you are bringing an eval dog out to the yard, adding them to the pp list, placing them in a clean room and giving them water, letting SUP know their eval is here and what size group they belong in and any info about prior socialization or things we should know, putting their belongings towards the end of the dc board with (eval) in parenthesess, if they fail moving their belongings from the board to their db room."}}]},{"id":"59b374f7-37e3-5c9b-b959-6f73cd18f0a9","section_key":"csr_misc_operations","title":"MISC Operations","sequence_order":9,"source_row":86,"items":[{"id":"3d4b9a6d-9dd0-5adc-8d6d-294ad0a53ec1","item_key":"csr_misc_operations_001_making_collars_and_body_checks_for_boaridng_do","label":"Making collars and body checks for boaridng dogs coming in the next day (where to find supplies, where to look at on gingr, how to file appropriately, when to move form next day and then put in alphabetical order by last name)","normalized_label":"making collars and body checks for boaridng dogs coming in the next day where to find supplies where to look at on gingr how to file appropriately when to move form next day and then put in alphabetical order by last name","sequence_order":1,"source_sheet":"Original Copy","source_row":87,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Making collars and body checks for boaridng dogs coming in the next day (where to find supplies, where to look at on gingr, how to file appropriately, when to move form next day and then put in alphabetical order by last name)"}},{"id":"cb0cb754-2d8c-5e0c-a265-00de17c74331","item_key":"csr_misc_operations_002_making_collars_for_dc_dogs_for_the_next_day_an","label":"Making collars for dc dogs for the next day and putting in alphabetical order on cork boards","normalized_label":"making collars for dc dogs for the next day and putting in alphabetical order on cork boards","sequence_order":2,"source_sheet":"Original Copy","source_row":88,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Making collars for dc dogs for the next day and putting in alphabetical order on cork boards"}},{"id":"94ce3122-ee46-5da0-9e7e-bb769376f338","item_key":"csr_misc_operations_003_front_desk_daily_checklist_where_to_fid_it_how","label":"Front Desk Daily Checklist (where to fid it how to fill it out)","normalized_label":"front desk daily checklist where to fid it how to fill it out","sequence_order":3,"source_sheet":"Original Copy","source_row":89,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Front Desk Daily Checklist (where to fid it how to fill it out)"}},{"id":"49e07479-cb35-5ad8-a1fc-7392b968fb17","item_key":"csr_misc_operations_004_how_to_set_up_the_eod_doc_at_the_beginning_of","label":"How to set up the EOD doc at the beginning of the day (how to make new one, sharing it with management team, adding mid day service to list, highlighting departing dogs leaving that day in yellow, deleting old notes that have already been put in the gingr profile)","normalized_label":"how to set up the eod doc at the beginning of the day how to make new one sharing it with management team adding mid day service to list highlighting departing dogs leaving that day in yellow deleting old notes that have already been put in the gingr profile","sequence_order":4,"source_sheet":"Original Copy","source_row":90,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to set up the EOD doc at the beginning of the day (how to make new one, sharing it with management team, adding mid day service to list, highlighting departing dogs leaving that day in yellow, deleting old notes that have already been put in the gingr profile)"}},{"id":"3ef2e402-d05d-5f32-89ca-d7c5eadaa698","item_key":"csr_misc_operations_005_how_to_set_up_eod_email_what_sort_of_info_to_a","label":"How to set up EOD email (what sort of info to add, who it is sent to and making sure management is cc'd)","normalized_label":"how to set up eod email what sort of info to add who it is sent to and making sure management is cc d","sequence_order":5,"source_sheet":"Original Copy","source_row":91,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to set up EOD email (what sort of info to add, who it is sent to and making sure management is cc'd)"}},{"id":"32219ceb-0924-5c16-9c8f-e5596f8ea01d","item_key":"csr_misc_operations_006_how_to_label_ffh_and_med_bags_where_to_put_med","label":"How to label FFH and med bags (where to put med bags in med box)","normalized_label":"how to label ffh and med bags where to put med bags in med box","sequence_order":6,"source_sheet":"Original Copy","source_row":92,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to label FFH and med bags (where to put med bags in med box)"}},{"id":"43228be6-32a1-511f-809d-6616598522c7","item_key":"csr_misc_operations_007_being_aware_of_tour_hours_and_how_to_schedule","label":"Being aware of tour hours and how to schedule tours (checking facility calneder for boaridng hours, making clients aware that tours are people only, adhering to tour hours, what info to give them at the end, swag bags)","normalized_label":"being aware of tour hours and how to schedule tours checking facility calneder for boaridng hours making clients aware that tours are people only adhering to tour hours what info to give them at the end swag bags","sequence_order":7,"source_sheet":"Original Copy","source_row":93,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Being aware of tour hours and how to schedule tours (checking facility calneder for boaridng hours, making clients aware that tours are people only, adhering to tour hours, what info to give them at the end, swag bags)"}},{"id":"a3c955bd-c23e-57d6-85a8-d1bce1c29061","item_key":"csr_misc_operations_008_lead_tracker_what_expectations_are_how_to_read","label":"Lead Tracker (what expectations are how to read it, how to add to it, how to use it)","normalized_label":"lead tracker what expectations are how to read it how to add to it how to use it","sequence_order":8,"source_sheet":"Original Copy","source_row":94,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Lead Tracker (what expectations are how to read it, how to add to it, how to use it)"}},{"id":"fb9dfcce-909d-5390-9223-c377cce8d7c4","item_key":"csr_misc_operations_009_answering_emails_of_various_scenarios","label":"Answering Emails of various scenarios","normalized_label":"answering emails of various scenarios","sequence_order":9,"source_sheet":"Original Copy","source_row":95,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Answering Emails of various scenarios"}},{"id":"80594c28-0624-58c8-9b37-4d12761a7453","item_key":"csr_misc_operations_010_how_to_check_a_dog_s_food_intake_on_gingr_if_o","label":"How to check a dog's food intake on gingr if owner calls asking how they are eating","normalized_label":"how to check a dog s food intake on gingr if owner calls asking how they are eating","sequence_order":10,"source_sheet":"Original Copy","source_row":96,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to check a dog's food intake on gingr if owner calls asking how they are eating"}},{"id":"7547ac5c-2540-5d12-bd58-42a5b34a6084","item_key":"csr_misc_operations_011_how_to_view_waitlist_for_boarding_on_gingr","label":"How to view waitlist for boarding on gingr","normalized_label":"how to view waitlist for boarding on gingr","sequence_order":11,"source_sheet":"Original Copy","source_row":97,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to view waitlist for boarding on gingr"}},{"id":"a1bc5c84-88be-50c9-9eb0-8b0845f1e80a","item_key":"csr_misc_operations_012_dc_waitlist_on_eod_doc_aware_of_dc_cap","label":"DC waitlist on EOD doc (aware of dc cap)","normalized_label":"dc waitlist on eod doc aware of dc cap","sequence_order":12,"source_sheet":"Original Copy","source_row":98,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"DC waitlist on EOD doc (aware of dc cap)"}},{"id":"6906fabb-93de-51f1-b15e-22c80e6c5b9a","item_key":"csr_misc_operations_013_cash_transactions_on_envelope_write_your_name","label":"Cash Transactions (on envelope write your name, cash amount given and date, inside include the invoice and exact change, bring into office and get MOD to make change, where to put envelopes)","normalized_label":"cash transactions on envelope write your name cash amount given and date inside include the invoice and exact change bring into office and get mod to make change where to put envelopes","sequence_order":13,"source_sheet":"Original Copy","source_row":99,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Cash Transactions (on envelope write your name, cash amount given and date, inside include the invoice and exact change, bring into office and get MOD to make change, where to put envelopes)"}},{"id":"673cdf78-73c6-5ec8-b70a-5d8ce536b928","item_key":"csr_misc_operations_014_vaccine_requirements_understands_and_can_expla","label":"Vaccine Requirements (understands and can explain incubation periods)","normalized_label":"vaccine requirements understands and can explain incubation periods","sequence_order":14,"source_sheet":"Original Copy","source_row":100,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Vaccine Requirements (understands and can explain incubation periods)"}},{"id":"038271c0-5d79-5a67-bc28-ceb585b1ba2b","item_key":"csr_misc_operations_015_policy_agrements_where_to_find_when_to_have_cl","label":"Policy Agrements (where to find, when to have client sign paper copy, how to upload)","normalized_label":"policy agrements where to find when to have client sign paper copy how to upload","sequence_order":15,"source_sheet":"Original Copy","source_row":101,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Policy Agrements (where to find, when to have client sign paper copy, how to upload)"}},{"id":"1a8c659e-103c-5eab-bd04-01ff65c61bfc","item_key":"csr_misc_operations_016_when_to_use_vaccine_waive_for_k9_flu_talk_to_m","label":"When to use vaccine waive for K9 Flu (talk to management before approving, where to find it , dog must be pp)","normalized_label":"when to use vaccine waive for k9 flu talk to management before approving where to find it dog must be pp","sequence_order":16,"source_sheet":"Original Copy","source_row":102,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"When to use vaccine waive for K9 Flu (talk to management before approving, where to find it , dog must be pp)"}},{"id":"f6eb001b-3780-5a9f-914b-755c097c3527","item_key":"csr_misc_operations_017_which_sheets_we_give_out_to_tours_and_evals","label":"Which sheets we give out to tours and evals","normalized_label":"which sheets we give out to tours and evals","sequence_order":17,"source_sheet":"Original Copy","source_row":103,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Which sheets we give out to tours and evals"}},{"id":"ab72a5fc-6388-5ecc-b6ec-0b4da84c766f","item_key":"csr_misc_operations_018_daily_cleaning_in_the_lobby_dusitng_wiping_cou","label":"Daily Cleaning in the lobby (dusitng, wiping counters, etc)","normalized_label":"daily cleaning in the lobby dusitng wiping counters etc","sequence_order":18,"source_sheet":"Original Copy","source_row":104,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Daily Cleaning in the lobby (dusitng, wiping counters, etc)"}},{"id":"9c6814c3-a8c9-5983-9a2d-63cbb327763a","item_key":"csr_misc_operations_019_lost_and_found_paying_attention_to_dogs_in_th","label":"Lost and Found (paying attention to dogs in th ebuilding with that icon and giving things back, removing icon once item is returned, how to add icon and how to label lost and found items)","normalized_label":"lost and found paying attention to dogs in th ebuilding with that icon and giving things back removing icon once item is returned how to add icon and how to label lost and found items","sequence_order":19,"source_sheet":"Original Copy","source_row":105,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Lost and Found (paying attention to dogs in th ebuilding with that icon and giving things back, removing icon once item is returned, how to add icon and how to label lost and found items)"}},{"id":"5520e5bd-2852-547b-8daa-e41b02d27594","item_key":"csr_misc_operations_020_how_and_when_to_text_clients_on_gingr","label":"How and when to text clients on gingr","normalized_label":"how and when to text clients on gingr","sequence_order":20,"source_sheet":"Original Copy","source_row":106,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How and when to text clients on gingr"}}]},{"id":"06c0057d-0331-54ff-addc-a471936ecf3d","section_key":"csr_cleaning","title":"Cleaning","sequence_order":10,"source_row":108,"items":[{"id":"384ad7ee-fbf6-5a5b-b3ee-91350c320d39","item_key":"csr_cleaning_001_sweeping_and_mopping_the_front_end_in_the_mori","label":"Sweeping and mopping the front end in the morinign with odor pet (making sure to use warm water, replacing dry mop head, hitting lobby, lux hallway, tour and dc hallway)","normalized_label":"sweeping and mopping the front end in the morinign with odor pet making sure to use warm water replacing dry mop head hitting lobby lux hallway tour and dc hallway","sequence_order":1,"source_sheet":"Original Copy","source_row":109,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Sweeping and mopping the front end in the morinign with odor pet (making sure to use warm water, replacing dry mop head, hitting lobby, lux hallway, tour and dc hallway)"}},{"id":"53c90480-2f6f-521e-9024-a04c4dcfb848","item_key":"csr_cleaning_002_cleaning_windows_throughout_day_and_at_the_end","label":"Cleaning windows throughout day and at the end of the night","normalized_label":"cleaning windows throughout day and at the end of the night","sequence_order":2,"source_sheet":"Original Copy","source_row":110,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Cleaning windows throughout day and at the end of the night"}},{"id":"e9c6ece9-e12a-5a3d-b273-2cf6937b6399","item_key":"csr_cleaning_003_taking_trash_out_and_replacing_trash_bags_at_t","label":"Taking trash out and replacing trash bags at the end of the night","normalized_label":"taking trash out and replacing trash bags at the end of the night","sequence_order":3,"source_sheet":"Original Copy","source_row":111,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Taking trash out and replacing trash bags at the end of the night"}},{"id":"fbbbd476-ec63-5eeb-95f3-dcb6ba6f5dee","item_key":"csr_cleaning_004_sweeping_and_mopping_the_front_end_at_night_wi","label":"Sweeping and Mopping the front end at night with rescue","normalized_label":"sweeping and mopping the front end at night with rescue","sequence_order":4,"source_sheet":"Original Copy","source_row":112,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Sweeping and Mopping the front end at night with rescue"}},{"id":"779c7c9a-ab3b-5279-a8e0-cc0d8c2e6556","item_key":"csr_cleaning_005_vaccumming_the_rug_in_the_vestibule","label":"Vaccumming the rug in the vestibule","normalized_label":"vaccumming the rug in the vestibule","sequence_order":5,"source_sheet":"Original Copy","source_row":113,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Vaccumming the rug in the vestibule"}},{"id":"b0f577de-e364-580e-8ac8-d7a077283663","item_key":"csr_cleaning_006_making_sure_desk_is_organized_supplies_are_not","label":"Making sure desk is organized, supplies are not out everywhere and everything is put away where it belongs.","normalized_label":"making sure desk is organized supplies are not out everywhere and everything is put away where it belongs","sequence_order":6,"source_sheet":"Original Copy","source_row":114,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Making sure desk is organized, supplies are not out everywhere and everything is put away where it belongs."}},{"id":"09ba180e-9580-5262-a4b2-1d784e908f64","item_key":"csr_cleaning_007_locking_and_unlocking_the_door","label":"Locking and unlocking the door","normalized_label":"locking and unlocking the door","sequence_order":7,"source_sheet":"Original Copy","source_row":115,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Locking and unlocking the door"}}]},{"id":"dfe77a5c-dc90-5770-8117-e3346eb9dfbe","section_key":"csr_customer_service","title":"Customer Service","sequence_order":11,"source_row":117,"items":[{"id":"27ef0386-8105-5fb2-a288-533d03133ef9","item_key":"csr_customer_service_001_understanding_and_is_able_to_explain_important","label":"Understanding and is able to explain important policies (boaridng hours, one dog in the lobby, age limits, 100% people friendly, etc)","normalized_label":"understanding and is able to explain important policies boaridng hours one dog in the lobby age limits 100 people friendly etc","sequence_order":1,"source_sheet":"Original Copy","source_row":118,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Understanding and is able to explain important policies (boaridng hours, one dog in the lobby, age limits, 100% people friendly, etc)"}},{"id":"a40e164e-1216-5b06-9c70-c2c47a6dbc0b","item_key":"csr_customer_service_002_understands_and_can_realy_all_vaccine_requirem","label":"Understands and can realy all vaccine requirements and incubation periods","normalized_label":"understands and can realy all vaccine requirements and incubation periods","sequence_order":2,"source_sheet":"Original Copy","source_row":119,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Understands and can realy all vaccine requirements and incubation periods"}},{"id":"71958ac2-cc33-51de-9c6a-9898b3503043","item_key":"csr_customer_service_003_can_understand_explain_and_sell_different_room","label":"Can understand explain and sell different room style accomodations explains to clients what would be the best fit for their dog, rates of each, pamper being included in lux room rate, capacity, dimensions)","normalized_label":"can understand explain and sell different room style accomodations explains to clients what would be the best fit for their dog rates of each pamper being included in lux room rate capacity dimensions","sequence_order":3,"source_sheet":"Original Copy","source_row":120,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Can understand explain and sell different room style accomodations explains to clients what would be the best fit for their dog, rates of each, pamper being included in lux room rate, capacity, dimensions)"}},{"id":"cd9e2027-1059-5a48-b8fd-7852ce056d37","item_key":"csr_customer_service_004_pricing_for_various_services","label":"Pricing for various services","normalized_label":"pricing for various services","sequence_order":4,"source_sheet":"Original Copy","source_row":121,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Pricing for various services"}},{"id":"d37439bf-0622-557a-a03c-7a54f34fb6d6","item_key":"csr_customer_service_005_phone_etiquette","label":"Phone etiquette","normalized_label":"phone etiquette","sequence_order":5,"source_sheet":"Original Copy","source_row":122,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Phone etiquette"}},{"id":"e0aaeee4-5cee-5b64-b8cf-4183a55bedb8","item_key":"csr_customer_service_006_how_to_talk_to_new_clients_and_explain_dc_vs_p","label":"How to talk to new clients and explain dc vs private play","normalized_label":"how to talk to new clients and explain dc vs private play","sequence_order":6,"source_sheet":"Original Copy","source_row":123,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to talk to new clients and explain dc vs private play"}},{"id":"2fbca328-d686-5f22-b478-d2f2fa1e006d","item_key":"csr_customer_service_007_how_to_talk_to_clients_about_enrichment_activi","label":"How to talk to clients about enrichment activities","normalized_label":"how to talk to clients about enrichment activities","sequence_order":7,"source_sheet":"Original Copy","source_row":124,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to talk to clients about enrichment activities"}},{"id":"ad0f8aab-efc2-50d0-91c1-ce24b25681fa","item_key":"csr_customer_service_008_how_to_explain_eval_process_to_clients","label":"How to explain eval process to clients","normalized_label":"how to explain eval process to clients","sequence_order":8,"source_sheet":"Original Copy","source_row":125,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to explain eval process to clients"}},{"id":"8929f835-fc51-56e1-8169-1f2356cfa980","item_key":"csr_customer_service_009_phone_call_scenarios","label":"Phone Call Scenarios","normalized_label":"phone call scenarios","sequence_order":9,"source_sheet":"Original Copy","source_row":127,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Phone Call Scenarios"}},{"id":"5d98e86e-7404-510f-9c8b-b756862d031e","item_key":"csr_customer_service_010_new_client_making_sure_to_use_client_and_dog_s","label":"New CLient (making sure to use client and dog's name as possible, interest in dc or boaridng or both, mentiong vaccine requirements, figuring out if they would be an eval or pp dog, making sure for dc they are altered or less than 10 months, is not over 13, for boaridng selling using house food, explaining all possible charges, making phone call personal)","normalized_label":"new client making sure to use client and dog s name as possible interest in dc or boaridng or both mentiong vaccine requirements figuring out if they would be an eval or pp dog making sure for dc they are altered or less than 10 months is not over 13 for boaridng selling using house food explaining all possible charges making phone call personal","sequence_order":10,"source_sheet":"Original Copy","source_row":128,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"New CLient (making sure to use client and dog's name as possible, interest in dc or boaridng or both, mentiong vaccine requirements, figuring out if they would be an eval or pp dog, making sure for dc they are altered or less than 10 months, is not over 13, for boaridng selling using house food, explaining all possible charges, making phone call personal)"}},{"id":"a8a1614b-d816-5ce5-8cf2-ed977859df0d","item_key":"csr_customer_service_011_existing_customer_phone_calls_how_to_search_in","label":"Existing Customer phone calls (how to search in gingr, and book or answer questions accordingly)","normalized_label":"existing customer phone calls how to search in gingr and book or answer questions accordingly","sequence_order":11,"source_sheet":"Original Copy","source_row":129,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Existing Customer phone calls (how to search in gingr, and book or answer questions accordingly)"}},{"id":"2e9dc76e-b0e1-5a0e-ad75-fc4e2cc37fe9","item_key":"csr_customer_service_012_complaint_about_bath_quality_how_to_respond_an","label":"Complaint about bath quality (how to respond and how to resovle)","normalized_label":"complaint about bath quality how to respond and how to resovle","sequence_order":12,"source_sheet":"Original Copy","source_row":130,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Complaint about bath quality (how to respond and how to resovle)"}},{"id":"335c886c-a6d8-5a39-81c8-6ce42e23c6d6","item_key":"csr_customer_service_013_why_are_there_no_public_cameras_how_to_respond","label":"Why are there no public cameras? (how to respond)","normalized_label":"why are there no public cameras how to respond","sequence_order":13,"source_sheet":"Original Copy","source_row":131,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Why are there no public cameras? (how to respond)"}},{"id":"cd48a709-a443-5e9a-a3b0-fc54ed5e07c0","item_key":"csr_customer_service_014_are_there_people_here_overnight_how_to_respond","label":"Are there people here overnight (how to respond and making sure by the end of convo client still feels comfortable leaving their dog in our care)","normalized_label":"are there people here overnight how to respond and making sure by the end of convo client still feels comfortable leaving their dog in our care","sequence_order":14,"source_sheet":"Original Copy","source_row":132,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Are there people here overnight (how to respond and making sure by the end of convo client still feels comfortable leaving their dog in our care)"}},{"id":"400068e1-ba09-5bae-b43c-1e1ea0b4e0c3","item_key":"csr_customer_service_015_how_to_handle_not_having_availability_in_the_a","label":"How to handle not having availability in the accomodation style for hte dates a client wants (offering different room type, adding to waitlist etc)","normalized_label":"how to handle not having availability in the accomodation style for hte dates a client wants offering different room type adding to waitlist etc","sequence_order":15,"source_sheet":"Original Copy","source_row":133,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"How to handle not having availability in the accomodation style for hte dates a client wants (offering different room type, adding to waitlist etc)"}},{"id":"2aa191ba-5f6a-5aec-b81f-747c1a7d692a","item_key":"csr_customer_service_016_why_can_i_not_bring_my_dog_s_blanket_choking_h","label":"Why can i not bring my dog's blanket? (choking hazard, policy etc)","normalized_label":"why can i not bring my dog s blanket choking hazard policy etc","sequence_order":16,"source_sheet":"Original Copy","source_row":134,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Why can i not bring my dog's blanket? (choking hazard, policy etc)"}}]},{"id":"1065117f-46fb-5c1b-80a7-f2bc82f03b66","section_key":"csr_tour","title":"Tour","sequence_order":12,"source_row":136,"items":[{"id":"572af6a9-5259-5cbf-980e-0f6c9aaa3ce8","item_key":"csr_tour_001_info_sheets_and_swag_bags_to_give_to_client_at","label":"Info sheets and swag bags to give to client at the end","normalized_label":"info sheets and swag bags to give to client at the end","sequence_order":1,"source_sheet":"Original Copy","source_row":137,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Info sheets and swag bags to give to client at the end"}},{"id":"23b03651-6e43-52d4-b0b8-d9b9d02e46d8","item_key":"csr_tour_002_personalization_tour_path_key_points","label":"Personalization, tour path, key points,","normalized_label":"personalization tour path key points","sequence_order":2,"source_sheet":"Original Copy","source_row":138,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Personalization, tour path, key points,"}},{"id":"09877281-6bc7-5fc1-8e57-ac1853830509","item_key":"csr_tour_003_closing_and_follow_up","label":"Closing and follow up","normalized_label":"closing and follow up","sequence_order":3,"source_sheet":"Original Copy","source_row":139,"source_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Closing and follow up"}}]}],"trainees":[{"sheet_name":"Sophia Miekle","normalized_employee_name":"sophia miekle","results":[{"item_key":"csr_gingr_owners_and_pets_001_create_a_new_owner_profile_with_one_dog","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":3,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Create a new owner profile with one dog"}},{"item_key":"csr_gingr_owners_and_pets_002_create_an_owner_profile_with_multiple_dogs","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":4,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Create an owner profile with multiple dogs"}},{"item_key":"csr_gingr_owners_and_pets_003_search_for_an_owner_profile","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":5,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Search for an owner profile"}},{"item_key":"csr_gingr_owners_and_pets_004_change_an_owner_s_information_ex_address_phone","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":6,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Change an owner's information (ex. address, phone number)"}},{"item_key":"csr_gingr_owners_and_pets_005_update_a_dog_s_information_change_birthday_vet","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":7,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Update a dog's information (change birthday, veterinarian, allergies, altered status)"}},{"item_key":"csr_gingr_owners_and_pets_006_update_a_dog_s_vaccine_info_how_to_update_immu","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":8,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Update a dog's vaccine info (how to update immunizations tab or shield, and how to upload file from email etc to owner's account)"}},{"item_key":"csr_gingr_owners_and_pets_007_adding_icons_to_a_dogs_account","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":9,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Adding icons to a dogs account"}},{"item_key":"csr_gingr_owners_and_pets_008_adding_owner_notes_to_a_gingr_profile","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":10,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Adding owner notes to a gingr profile"}},{"item_key":"csr_gingr_owners_and_pets_009_adding_dog_notes_to_a_gingr_profile_copying_a","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":11,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Adding dog notes to a gingr profile (copying a pasting from EOD and marking it off in the EOD as input on gingr, or putting notes in after verbally speaking to client as it relates to the dog)"}},{"item_key":"csr_gingr_owners_and_pets_010_push_agreements_to_device","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":12,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Push agreements to device"}},{"item_key":"csr_gingr_owners_and_pets_011_locate_reservations_under_the_owner_or_if_mult","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":13,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Locate reservations under the owner or if multiple dogs for a specific dog as well (future, past, present)"}},{"item_key":"csr_gingr_owners_and_pets_012_deduct_package_credit_manually","section_key":"csr_gingr_owners_and_pets","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":14,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Deduct package credit manually"}},{"item_key":"csr_gingr_owners_and_pets_013_view_invoice_history","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":15,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"View invoice history"}},{"item_key":"csr_gingr_owners_and_pets_014_locate_reservation_requests_and_learning_how_t","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":16,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Locate reservation requests and learning how to accept or reject properly (for daycare verifiyng numbers to make sure we have room for dates requested, for boaridng verifiying and building entire reservation before hitting accept, for rejection making sure we are calling and notifying client as well)"}},{"item_key":"csr_gingr_owners_and_pets_015_can_differentiate_between_icons","section_key":"csr_gingr_owners_and_pets","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":17,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Can differentiate between icons"}},{"item_key":"csr_gingr_shopping_cart_001_purchase_store_credit_for_an_owner_through_sho","section_key":"csr_gingr_shopping_cart","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":20,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Purchase store credit for an owner (through shopping cart and also through the owner profile)"}},{"item_key":"csr_gingr_shopping_cart_002_purchase_gift_certificate","section_key":"csr_gingr_shopping_cart","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":21,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Purchase gift certificate"}},{"item_key":"csr_gingr_shopping_cart_003_process_a_refund","section_key":"csr_gingr_shopping_cart","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":22,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Process a refund"}},{"item_key":"csr_gingr_shopping_cart_004_apply_discounts_properly","section_key":"csr_gingr_shopping_cart","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":23,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Apply discounts properly"}},{"item_key":"csr_gingr_shopping_cart_005_check_out_using_daycare_package","section_key":"csr_gingr_shopping_cart","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":24,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Check out using daycare package"}},{"item_key":"csr_gingr_shopping_cart_006_checkout_boarding_dog","section_key":"csr_gingr_shopping_cart","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":25,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Checkout boarding dog"}},{"item_key":"csr_gingr_shopping_cart_007_when_checking_out_dogs_making_sure_to_check_eo","section_key":"csr_gingr_shopping_cart","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":26,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"When checking out dogs making sure to check EOD doc for any notes throughout the day/boarding stay. Relaying to owners and initialing EOD doc properly"}},{"item_key":"csr_gingr_point_of_sale_001_purchase_a_dc_package","section_key":"csr_gingr_point_of_sale","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":29,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Purchase a dc package"}},{"item_key":"csr_gingr_point_of_sale_002_purchase_a_boaridng_package","section_key":"csr_gingr_point_of_sale","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":30,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Purchase a boaridng package"}},{"item_key":"csr_gingr_point_of_sale_003_how_to_purchase_free_day_of_dc_free_bath_etc","section_key":"csr_gingr_point_of_sale","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":31,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How to purchase free day of dc, free bath, etc"}},{"item_key":"csr_making_reservations_on_gingr_001_creating_a_5_day_boaridng_stay_in_a_lux_room_a","section_key":"csr_making_reservations_on_gingr","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":34,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Creating a 5 day boaridng stay in a lux room, adding a bath with an 11:30 p/u time, house food chicken, reviewing estimate (making client aware of peak prices any additional fees they may not be expecting that are not for a service or rate of the room) and collecting 50% deposit."}},{"item_key":"csr_making_reservations_on_gingr_002_creating_a_7_day_boarding_stay_in_an_exec_for","section_key":"csr_making_reservations_on_gingr","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":35,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Creating a 7 day boarding stay in an exec for two dogs in the same room, both need bath, both are bagged ffh, both getting ice cream, review and collecting deposit)"}},{"item_key":"csr_making_reservations_on_gingr_003_create_a_3_day_boarding_stay_in_compartments_w","section_key":"csr_making_reservations_on_gingr","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":36,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Create a 3 day boarding stay in compartments with a bath, ffh unbagged"}},{"item_key":"csr_making_reservations_on_gingr_004_shorten_a_reservation_ensuring_all_steps_taken","section_key":"csr_making_reservations_on_gingr","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":37,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"shorten a reservation (ensuring all steps taken properly on gingr and services/charges are properly adjusted, as well as notifying supervisor so the back end and make necessary changes)"}},{"item_key":"csr_making_reservations_on_gingr_005_extend_a_reservation_ensuring_all_steps_taken","section_key":"csr_making_reservations_on_gingr","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":38,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Extend a reservation (ensuring all steps taken properly on gingr and services/charges are properly adjusts, as well as notifying supervisor so the back end and make necessary changes)"}},{"item_key":"csr_making_reservations_on_gingr_006_cancel_a_reservation_and_forfeit_the_the_depos","section_key":"csr_making_reservations_on_gingr","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":39,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Cancel a reservation and forfeit the the deposit, apply forfeited amount as store credit"}},{"item_key":"csr_making_reservations_on_gingr_007_make_a_daycare_reservation","section_key":"csr_making_reservations_on_gingr","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":40,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Make a daycare reservation"}},{"item_key":"csr_making_reservations_on_gingr_008_making_a_reservation_for_a_dog_that_has_not_be","section_key":"csr_making_reservations_on_gingr","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":41,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Making a reservation for a dog that has not been here in 6 months with bad notes, or a dog who has not been here in 1 year (making sure vax are updated and verify that they need to be re-evaled for group)"}},{"item_key":"csr_making_reservations_on_gingr_009_make_a_daycare_reservation_for_reoccuring_date","section_key":"csr_making_reservations_on_gingr","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":42,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Make a daycare reservation for reoccuring dates"}},{"item_key":"csr_making_reservations_on_gingr_010_make_multiple_daycare_reservations_at_once","section_key":"csr_making_reservations_on_gingr","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":43,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Make multiple daycare reservations at once"}},{"item_key":"csr_making_reservations_on_gingr_011_make_a_dayboaridng_reservation","section_key":"csr_making_reservations_on_gingr","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":44,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Make a dayboaridng reservation"}},{"item_key":"csr_gingr_dashboard_001_check_in_a_dog_for_a_full_day_of_dc","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":47,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Check in a dog for a full day of dc"}},{"item_key":"csr_gingr_dashboard_002_check_in_a_dog_for_a_half_day_of_dc","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":48,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Check in a dog for a half day of dc"}},{"item_key":"csr_gingr_dashboard_003_check_in_a_dog_for_dayboarding_grabbing_collar","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":49,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Check in a dog for dayboarding (grabbing collar, laminated run card, or printing run card and writing dayboaridng and highlighting properly)"}},{"item_key":"csr_gingr_dashboard_004_check_in_a_dog_for_boaridng_asking_client_all","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":50,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Check in a dog for boaridng (asking client all check-in questions and writing EVERYTHING we need to know about the dog's reservation on the check in sheet, confirming everything we have in gingr is accurate)"}},{"item_key":"csr_gingr_dashboard_005_highlighting_run_card_properly_and_notating_im","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":51,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Highlighting run card properly and notating important information on run cards when doing boaridng check ins"}},{"item_key":"csr_gingr_dashboard_006_add_services_to_a_dog_that_is_already_checked","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":52,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Add services to a dog that is already checked in (dc bath, enrichment, etc)"}},{"item_key":"csr_gingr_dashboard_007_turn_a_daycare_reservation_into_a_boarding_res","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":53,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Turn a daycare reservation into a boarding reservation (for exmaple Boots' owners called back and need to keep her overnight make sure everything in system is updated accordingly, deposit is still taken, collar updated, SUP notified)"}},{"item_key":"csr_gingr_dashboard_008_add_an_owner_icon","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":54,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Add an owner icon"}},{"item_key":"csr_gingr_dashboard_009_view_lodging_calendar_and_can_understand_how_t","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":55,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"View lodging calendar and can understand how to read it"}},{"item_key":"csr_gingr_dashboard_010_view_facility_calendar_understand_how_to_read","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":56,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"View facility calendar, understand how to read it, when to use it"}},{"item_key":"csr_gingr_dashboard_011_knows_how_to_view_all_owners","section_key":"csr_gingr_dashboard","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":57,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Knows how to \"view all owners\""}},{"item_key":"csr_gingr_dashboard_012_knows_how_to_search_checked_in_expected_going","section_key":"csr_gingr_dashboard","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Allison D","verified_by":"","note_text":"","source_row":58,"raw_values":{"checkbox_status":false,"demonstrated_by":"Allison D","verified_accuracy_by":"","category_task_text":"Knows how to search \"checked in/expected/going home\" on gingr by icon"}},{"item_key":"csr_reports_001_lodging_transfer_report_in_the_am_printing_and","section_key":"csr_reports","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":61,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Lodging Transfer Report (in the AM printing and making new collars, in afternoon getting lodging transfers set up for the next day and making new collars)"}},{"item_key":"csr_reports_002_missing_lodgings_sometimes_requests_that_have","section_key":"csr_reports","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":62,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Missing Lodgings (sometimes requests that have not been worked on yet will show up in this report, knows how to fix)"}},{"item_key":"csr_reports_003_lunch_med_report","section_key":"csr_reports","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":63,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Lunch Med report"}},{"item_key":"csr_reports_004_lunch_feeidng_report","section_key":"csr_reports","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":64,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Lunch Feeidng report"}},{"item_key":"csr_reports_005_files_reports_for_vax_uploads_in_the_am_review","section_key":"csr_reports","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":65,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Files Reports (for vax uploads in the AM review from the night prior to that morning, in the PM just checking things uploaded from current day_"}},{"item_key":"csr_reports_006_deposits_check_and_canceled_reservations_pendi","section_key":"csr_reports","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":66,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Deposits check (and canceled reservations pending resolution knnows how to resolve)"}},{"item_key":"csr_reports_007_expired_vaccine_report_call_vets_email_reminde","section_key":"csr_reports","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":67,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Expired Vaccine Report (call vets, email reminders to owner, look at dogs with reservations a week out at least, knows what dates to look at)"}},{"item_key":"csr_notes_001_how_to_input_dogs_first_and_last_name_date_and","section_key":"csr_notes","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":70,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"How to input (dogs first and last name, date and time and where to put DC dog notes in EOD doc and on gingr (how to notate on eod doc that it was relayed to owner and how to inital it so everyone knows you spoke to them, highlighting it blue after it has been transferred from the EOD doc to the account)"}},{"item_key":"csr_notes_002_how_to_input_notes_for_boaridng_dogs_how_it_is","section_key":"csr_notes","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":71,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"How to input notes for boaridng dogs (how it is organized in EOD doc, how to put them in, when they should be transferred to gingr)"}},{"item_key":"csr_notes_003_putting_eval_notes_in_to_the_dogs_profile_upda","section_key":"csr_notes","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":72,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Putting eval notes in to the dogs profile, updating flags accordingly, for boarding evals remembering to update collars and run cards appropriately."}},{"item_key":"csr_notes_004_sick_and_injured_list_notes_whenever_an_owner","section_key":"csr_notes","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":73,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Sick and Injured List notes (whenever an owner calls to let us know of any sort of illness or inury related to the dog - add them to the list with a description of what is wrong and the initial date of then you found the info, following up one week later, after 1 follow up remove from eod doc and input into gingr profile"}},{"item_key":"csr_running_dogs_001_bringing_dogs_from_lobby_to_dc_making_sure_the","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":76,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Bringing dogs from lobby to dc - making sure they have a reservation - taking to appropriate daycare - giving them a collar - relaying to dc pct who you have and any important info about the dog that all staff should be aware of"}},{"item_key":"csr_running_dogs_002_what_to_do_with_dc_dog_belongings_and_making_s","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":77,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"What to do with dc dog belongings and making sure there stuff is in the right place, writing their name and last initial on the correct whiteboard"}},{"item_key":"csr_running_dogs_003_running_boarding_dogs_to_dc_getting_their_coll","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":78,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Running boarding dogs to dc - getting their collar from the drawer, doing a full body check, bringing their belongings back up to the front, notating the body check as well as documenting their belongings in the items list section of the body check form"}},{"item_key":"csr_running_dogs_004_running_dogs_going_home_from_dc_asking_for_the","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":79,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Running dogs going home from dc - asking for the dog in the gate over the walkie, ensuring you are grabbing the correct belongings, verifying the collar on the dog and making sure you are grabbing the right dog."}},{"item_key":"csr_running_dogs_005_running_boarding_dogs_to_go_home_checking_the","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":80,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Running boarding dogs to go home - checking the departing board and grabbing the right stuff maing sure to read any notes on the board like (food in the fridge, stuff under the sink etc) and remembering if they have a star next to their name they get perfume on the way out, always double checking collars to make sure you have the right dog."}},{"item_key":"csr_running_dogs_006_bringing_dayboarding_or_pp_boarding_dogs_back","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":81,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Bringing dayboarding or pp boarding dogs back in the morning - making sure to announce pp dog over walkie, adding to the pp list, and giving the dog water"}},{"item_key":"csr_running_dogs_007_bringing_dayboarding_dogs_back_up_to_lobby_to","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":82,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Bringing dayboarding dogs back up to lobby to leave, announcing pp dog, grabbing all of the dogs belongings, crossing them off the pp list"}},{"item_key":"csr_running_dogs_008_bringing_pp_boaridng_dogs_up_to_the_lobby_maki","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":83,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Bringing PP boaridng dogs up to the lobby - making sure to read any notes (like ffh in the fridge, spray me when i leave, dont forget my toys etc) announcing pp dog over walkie, bringing to lobby"}},{"item_key":"csr_running_dogs_009_running_evaluation_dogs_to_the_back_announcing","section_key":"csr_running_dogs","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":84,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Running evaluation dogs to the back (announcing you are bringing an eval dog out to the yard, adding them to the pp list, placing them in a clean room and giving them water, letting SUP know their eval is here and what size group they belong in and any info about prior socialization or things we should know, putting their belongings towards the end of the dc board with (eval) in parenthesess, if they fail moving their belongings from the board to their db room."}},{"item_key":"csr_misc_operations_001_making_collars_and_body_checks_for_boaridng_do","section_key":"csr_misc_operations","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":87,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Making collars and body checks for boaridng dogs coming in the next day (where to find supplies, where to look at on gingr, how to file appropriately, when to move form next day and then put in alphabetical order by last name)"}},{"item_key":"csr_misc_operations_002_making_collars_for_dc_dogs_for_the_next_day_an","section_key":"csr_misc_operations","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":88,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Making collars for dc dogs for the next day and putting in alphabetical order on cork boards"}},{"item_key":"csr_misc_operations_003_front_desk_daily_checklist_where_to_fid_it_how","section_key":"csr_misc_operations","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":89,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Front Desk Daily Checklist (where to fid it how to fill it out)"}},{"item_key":"csr_misc_operations_004_how_to_set_up_the_eod_doc_at_the_beginning_of","section_key":"csr_misc_operations","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":90,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"How to set up the EOD doc at the beginning of the day (how to make new one, sharing it with management team, adding mid day service to list, highlighting departing dogs leaving that day in yellow, deleting old notes that have already been put in the gingr profile)"}},{"item_key":"csr_misc_operations_005_how_to_set_up_eod_email_what_sort_of_info_to_a","section_key":"csr_misc_operations","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":91,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"How to set up EOD email (what sort of info to add, who it is sent to and making sure management is cc'd)"}},{"item_key":"csr_misc_operations_006_how_to_label_ffh_and_med_bags_where_to_put_med","section_key":"csr_misc_operations","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":92,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"How to label FFH and med bags (where to put med bags in med box)"}},{"item_key":"csr_misc_operations_007_being_aware_of_tour_hours_and_how_to_schedule","section_key":"csr_misc_operations","readiness_status":"not_started","item_status":"not_started","demonstrated_by":"","verified_by":"","note_text":"","source_row":93,"raw_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Being aware of tour hours and how to schedule tours (checking facility calneder for boaridng hours, making clients aware that tours are people only, adhering to tour hours, what info to give them at the end, swag bags)"}},{"item_key":"csr_misc_operations_008_lead_tracker_what_expectations_are_how_to_read","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":94,"raw_values":{"checkbox_status":false,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Lead Tracker (what expectations are how to read it, how to add to it, how to use it)"}},{"item_key":"csr_misc_operations_009_answering_emails_of_various_scenarios","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":95,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Answering Emails of various scenarios"}},{"item_key":"csr_misc_operations_010_how_to_check_a_dog_s_food_intake_on_gingr_if_o","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":96,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How to check a dog's food intake on gingr if owner calls asking how they are eating"}},{"item_key":"csr_misc_operations_011_how_to_view_waitlist_for_boarding_on_gingr","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":97,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How to view waitlist for boarding on gingr"}},{"item_key":"csr_misc_operations_012_dc_waitlist_on_eod_doc_aware_of_dc_cap","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":98,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"DC waitlist on EOD doc (aware of dc cap)"}},{"item_key":"csr_misc_operations_013_cash_transactions_on_envelope_write_your_name","section_key":"csr_misc_operations","readiness_status":"not_started","item_status":"not_started","demonstrated_by":"","verified_by":"","note_text":"","source_row":99,"raw_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Cash Transactions (on envelope write your name, cash amount given and date, inside include the invoice and exact change, bring into office and get MOD to make change, where to put envelopes)"}},{"item_key":"csr_misc_operations_014_vaccine_requirements_understands_and_can_expla","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":100,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Vaccine Requirements (understands and can explain incubation periods)"}},{"item_key":"csr_misc_operations_015_policy_agrements_where_to_find_when_to_have_cl","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":101,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Policy Agrements (where to find, when to have client sign paper copy, how to upload)"}},{"item_key":"csr_misc_operations_016_when_to_use_vaccine_waive_for_k9_flu_talk_to_m","section_key":"csr_misc_operations","readiness_status":"not_started","item_status":"not_started","demonstrated_by":"","verified_by":"","note_text":"","source_row":102,"raw_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"When to use vaccine waive for K9 Flu (talk to management before approving, where to find it , dog must be pp)"}},{"item_key":"csr_misc_operations_017_which_sheets_we_give_out_to_tours_and_evals","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":103,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Which sheets we give out to tours and evals"}},{"item_key":"csr_misc_operations_018_daily_cleaning_in_the_lobby_dusitng_wiping_cou","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":104,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Daily Cleaning in the lobby (dusitng, wiping counters, etc)"}},{"item_key":"csr_misc_operations_019_lost_and_found_paying_attention_to_dogs_in_th","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":105,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Lost and Found (paying attention to dogs in th ebuilding with that icon and giving things back, removing icon once item is returned, how to add icon and how to label lost and found items)"}},{"item_key":"csr_misc_operations_020_how_and_when_to_text_clients_on_gingr","section_key":"csr_misc_operations","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":106,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How and when to text clients on gingr"}},{"item_key":"csr_cleaning_001_sweeping_and_mopping_the_front_end_in_the_mori","section_key":"csr_cleaning","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":109,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Sweeping and mopping the front end in the morinign with odor pet (making sure to use warm water, replacing dry mop head, hitting lobby, lux hallway, tour and dc hallway)"}},{"item_key":"csr_cleaning_002_cleaning_windows_throughout_day_and_at_the_end","section_key":"csr_cleaning","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":110,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Cleaning windows throughout day and at the end of the night"}},{"item_key":"csr_cleaning_003_taking_trash_out_and_replacing_trash_bags_at_t","section_key":"csr_cleaning","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":111,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Taking trash out and replacing trash bags at the end of the night"}},{"item_key":"csr_cleaning_004_sweeping_and_mopping_the_front_end_at_night_wi","section_key":"csr_cleaning","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":112,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Sweeping and Mopping the front end at night with rescue"}},{"item_key":"csr_cleaning_005_vaccumming_the_rug_in_the_vestibule","section_key":"csr_cleaning","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":113,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Vaccumming the rug in the vestibule"}},{"item_key":"csr_cleaning_006_making_sure_desk_is_organized_supplies_are_not","section_key":"csr_cleaning","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":114,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Making sure desk is organized, supplies are not out everywhere and everything is put away where it belongs."}},{"item_key":"csr_cleaning_007_locking_and_unlocking_the_door","section_key":"csr_cleaning","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":115,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Locking and unlocking the door"}},{"item_key":"csr_customer_service_001_understanding_and_is_able_to_explain_important","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":118,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Understanding and is able to explain important policies (boaridng hours, one dog in the lobby, age limits, 100% people friendly, etc)"}},{"item_key":"csr_customer_service_002_understands_and_can_realy_all_vaccine_requirem","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":119,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Understands and can realy all vaccine requirements and incubation periods"}},{"item_key":"csr_customer_service_003_can_understand_explain_and_sell_different_room","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":120,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Can understand explain and sell different room style accomodations explains to clients what would be the best fit for their dog, rates of each, pamper being included in lux room rate, capacity, dimensions)"}},{"item_key":"csr_customer_service_004_pricing_for_various_services","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":121,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Pricing for various services"}},{"item_key":"csr_customer_service_005_phone_etiquette","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":122,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Phone etiquette"}},{"item_key":"csr_customer_service_006_how_to_talk_to_new_clients_and_explain_dc_vs_p","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":123,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How to talk to new clients and explain dc vs private play"}},{"item_key":"csr_customer_service_007_how_to_talk_to_clients_about_enrichment_activi","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":124,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How to talk to clients about enrichment activities"}},{"item_key":"csr_customer_service_008_how_to_explain_eval_process_to_clients","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":125,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How to explain eval process to clients"}},{"item_key":"csr_customer_service_009_phone_call_scenarios","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":127,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Phone Call Scenarios"}},{"item_key":"csr_customer_service_010_new_client_making_sure_to_use_client_and_dog_s","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":128,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"New CLient (making sure to use client and dog's name as possible, interest in dc or boaridng or both, mentiong vaccine requirements, figuring out if they would be an eval or pp dog, making sure for dc they are altered or less than 10 months, is not over 13, for boaridng selling using house food, explaining all possible charges, making phone call personal)"}},{"item_key":"csr_customer_service_011_existing_customer_phone_calls_how_to_search_in","section_key":"csr_customer_service","readiness_status":"verified","item_status":"complete","demonstrated_by":"Angelina D","verified_by":"Angelina D","note_text":"","source_row":129,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"Angelina D","category_task_text":"Existing Customer phone calls (how to search in gingr, and book or answer questions accordingly)"}},{"item_key":"csr_customer_service_012_complaint_about_bath_quality_how_to_respond_an","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":130,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Complaint about bath quality (how to respond and how to resovle)"}},{"item_key":"csr_customer_service_013_why_are_there_no_public_cameras_how_to_respond","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":131,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Why are there no public cameras? (how to respond)"}},{"item_key":"csr_customer_service_014_are_there_people_here_overnight_how_to_respond","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":132,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Are there people here overnight (how to respond and making sure by the end of convo client still feels comfortable leaving their dog in our care)"}},{"item_key":"csr_customer_service_015_how_to_handle_not_having_availability_in_the_a","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":133,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"How to handle not having availability in the accomodation style for hte dates a client wants (offering different room type, adding to waitlist etc)"}},{"item_key":"csr_customer_service_016_why_can_i_not_bring_my_dog_s_blanket_choking_h","section_key":"csr_customer_service","readiness_status":"demonstrated","item_status":"in_progress","demonstrated_by":"Angelina D","verified_by":"","note_text":"","source_row":134,"raw_values":{"checkbox_status":true,"demonstrated_by":"Angelina D","verified_accuracy_by":"","category_task_text":"Why can i not bring my dog's blanket? (choking hazard, policy etc)"}},{"item_key":"csr_tour_001_info_sheets_and_swag_bags_to_give_to_client_at","section_key":"csr_tour","readiness_status":"not_started","item_status":"not_started","demonstrated_by":"","verified_by":"","note_text":"","source_row":137,"raw_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Info sheets and swag bags to give to client at the end"}},{"item_key":"csr_tour_002_personalization_tour_path_key_points","section_key":"csr_tour","readiness_status":"not_started","item_status":"not_started","demonstrated_by":"","verified_by":"","note_text":"","source_row":138,"raw_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Personalization, tour path, key points,"}},{"item_key":"csr_tour_003_closing_and_follow_up","section_key":"csr_tour","readiness_status":"not_started","item_status":"not_started","demonstrated_by":"","verified_by":"","note_text":"","source_row":139,"raw_values":{"checkbox_status":false,"demonstrated_by":"","verified_accuracy_by":"","category_task_text":"Closing and follow up"}}]}],"import_report":{"source_workbook_name":"CSR Training.xlsx","sheet_count":2,"template_sheet_name":"Original Copy","trainee_sheet_count":1,"template_section_count":12,"template_item_count":114,"trainee_result_count":114,"verified_result_count":70,"demonstrated_result_count":108,"not_started_result_count":6,"categories":[{"title":"Gingr Owners and Pets","item_count":15,"source_row":2},{"title":"Gingr Shopping Cart","item_count":7,"source_row":19},{"title":"Gingr Point of Sale","item_count":3,"source_row":28},{"title":"Making Reservations on Gingr","item_count":11,"source_row":33},{"title":"Gingr Dashboard","item_count":12,"source_row":46},{"title":"Reports","item_count":7,"source_row":60},{"title":"Notes","item_count":4,"source_row":69},{"title":"Running Dogs","item_count":9,"source_row":75},{"title":"MISC Operations","item_count":20,"source_row":86},{"title":"Cleaning","item_count":7,"source_row":108},{"title":"Customer Service","item_count":16,"source_row":117},{"title":"Tour","item_count":3,"source_row":136}]}}$seed$::jsonb;
  v_template_id uuid := (v_seed->'template'->>'id')::uuid;
  v_version_id uuid := (v_seed->'template'->>'version_id')::uuid;
  v_section jsonb;
  v_item jsonb;
  v_trainee jsonb;
  v_result jsonb;
  v_section_id uuid;
  v_item_id uuid;
  v_record_id uuid;
  v_employee public.labor_employees%ROWTYPE;
  v_employee_id uuid;
  v_match_count integer := 0;
  v_record_location_id uuid;
  v_record_employee_name text;
  v_record_labor_employee_id uuid;
  v_record_position_title text;
  v_record_hire_date date;
  v_record_trainer_name text;
  v_record_manager_name text;
  v_import_match_method text;
  v_fallback_location_id uuid;
  v_match_report jsonb := jsonb_build_object('matched', '[]'::jsonb, 'unmatched', '[]'::jsonb, 'ambiguous', '[]'::jsonb);
  v_required_count integer := 0;
BEGIN
  INSERT INTO public.training_templates (
    id,
    slug,
    name,
    template_class,
    role_scopes,
    location_id,
    is_active
  )
  VALUES (
    v_template_id,
    v_seed->'template'->>'slug',
    v_seed->'template'->>'name',
    'training_plan',
    ARRAY['csr', 'customer_service_representative'],
    NULL,
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    role_scopes = EXCLUDED.role_scopes,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_template_id;

  UPDATE public.training_template_versions
  SET is_current = false
  WHERE template_id = v_template_id
    AND id <> v_version_id;

  INSERT INTO public.training_template_versions (
    id,
    template_id,
    version_no,
    status,
    is_current,
    source_seed_key,
    source_packet,
    changelog,
    metadata,
    published_at
  )
  VALUES (
    v_version_id,
    v_template_id,
    1,
    'published',
    true,
    v_seed->'template'->>'source_seed_key',
    v_seed->'template'->>'source_packet',
    'Initial CSR readiness board import from workbook.',
    jsonb_build_object('import_report', v_seed->'import_report', 'readiness_board', true, 'readiness_role', 'csr'),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    status = 'published',
    is_current = true,
    source_seed_key = EXCLUDED.source_seed_key,
    source_packet = EXCLUDED.source_packet,
    changelog = EXCLUDED.changelog,
    metadata = EXCLUDED.metadata,
    published_at = COALESCE(public.training_template_versions.published_at, now());

  FOR v_section IN SELECT value FROM jsonb_array_elements(v_seed->'sections') LOOP
    INSERT INTO public.training_template_sections (
      id,
      template_version_id,
      section_key,
      title,
      section_type,
      sequence_order,
      completion_mode,
      metadata
    )
    VALUES (
      (v_section->>'id')::uuid,
      v_version_id,
      v_section->>'section_key',
      v_section->>'title',
      'checklist',
      (v_section->>'sequence_order')::integer,
      'complete_only',
      jsonb_build_object(
        'source_sheet', 'Original Copy',
        'source_row', (v_section->>'source_row')::integer,
        'readiness_category', true,
        'readiness_role', 'csr'
      )
    )
    ON CONFLICT (template_version_id, section_key) DO UPDATE
    SET
      title = EXCLUDED.title,
      sequence_order = EXCLUDED.sequence_order,
      metadata = EXCLUDED.metadata
    RETURNING id INTO v_section_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_section->'items') LOOP
      INSERT INTO public.training_template_items (
        id,
        template_version_id,
        template_section_id,
        item_key,
        label,
        description,
        item_type,
        sequence_order,
        required,
        completion_mode,
        metadata
      )
      VALUES (
        (v_item->>'id')::uuid,
        v_version_id,
        v_section_id,
        v_item->>'item_key',
        v_item->>'label',
        NULL,
        'task',
        (v_item->>'sequence_order')::integer,
        true,
        'complete_only',
        jsonb_build_object(
          'normalized_label', v_item->>'normalized_label',
          'source_sheet', v_item->>'source_sheet',
          'source_row', (v_item->>'source_row')::integer,
          'source_values', v_item->'source_values',
          'readiness_task', true,
          'readiness_role', 'csr'
        )
      )
      ON CONFLICT (template_version_id, item_key) DO UPDATE
      SET
        template_section_id = EXCLUDED.template_section_id,
        label = EXCLUDED.label,
        sequence_order = EXCLUDED.sequence_order,
        metadata = EXCLUDED.metadata;
    END LOOP;
  END LOOP;

  SELECT COUNT(*)
  INTO v_required_count
  FROM public.training_template_items
  WHERE template_version_id = v_version_id
    AND required = true;

  v_fallback_location_id := public.resolve_labor_location_id('cherry-hill', NULL);

  FOR v_trainee IN SELECT value FROM jsonb_array_elements(v_seed->'trainees') LOOP
    v_employee := NULL;
    v_employee_id := NULL;
    v_record_location_id := NULL;
    v_record_employee_name := v_trainee->>'sheet_name';
    v_record_labor_employee_id := NULL;
    v_record_position_title := 'CSR';
    v_record_hire_date := NULL;
    v_record_trainer_name := NULL;
    v_record_manager_name := NULL;
    v_import_match_method := 'workbook_sheet_unlinked';

    SELECT COUNT(*), (array_agg(e.id ORDER BY COALESCE(e.start_date, e.first_shift_date) DESC NULLS LAST, e.full_name))[1]
    INTO v_match_count, v_employee_id
    FROM public.labor_employees e
    WHERE e.employment_status = 'active'
      AND regexp_replace(lower(e.full_name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(v_trainee->>'sheet_name'), '[^a-z0-9]+', '', 'g');

    IF v_match_count = 1 THEN
      SELECT *
      INTO v_employee
      FROM public.labor_employees e
      WHERE e.id = v_employee_id;

      v_record_location_id := v_employee.location_id;
      v_record_employee_name := v_employee.full_name;
      v_record_labor_employee_id := v_employee.id;
      v_record_position_title := COALESCE(NULLIF(v_employee.position_title, ''), 'CSR');
      v_record_hire_date := COALESCE(v_employee.first_shift_date, v_employee.start_date);
      v_record_trainer_name := v_employee.assigned_trainer_name;
      v_record_manager_name := v_employee.assigned_manager_name;
      v_import_match_method := 'employee_name_exact';

      v_match_report := jsonb_set(
        v_match_report,
        '{matched}',
        (v_match_report->'matched') || jsonb_build_array(jsonb_build_object(
          'sheet_name', v_trainee->>'sheet_name',
          'labor_employee_id', v_employee.id,
          'employee_name', v_employee.full_name,
          'location_id', v_employee.location_id
        ))
      );
    ELSIF v_fallback_location_id IS NOT NULL THEN
      v_record_location_id := v_fallback_location_id;

      IF v_match_count = 0 THEN
        v_match_report := jsonb_set(
          v_match_report,
          '{unmatched}',
          (v_match_report->'unmatched') || jsonb_build_array(jsonb_build_object(
            'sheet_name', v_trainee->>'sheet_name',
            'normalized_employee_name', v_trainee->>'normalized_employee_name',
            'created_unlinked_record', true,
            'location_slug', 'cherry-hill'
          ))
        );
      ELSE
        v_match_report := jsonb_set(
          v_match_report,
          '{ambiguous}',
          (v_match_report->'ambiguous') || jsonb_build_array(jsonb_build_object(
            'sheet_name', v_trainee->>'sheet_name',
            'normalized_employee_name', v_trainee->>'normalized_employee_name',
            'match_count', v_match_count,
            'created_unlinked_record', true,
            'location_slug', 'cherry-hill'
          ))
        );
      END IF;
    ELSE
      v_match_report := jsonb_set(
        v_match_report,
        CASE WHEN v_match_count = 0 THEN '{unmatched}'::text[] ELSE '{ambiguous}'::text[] END,
        (v_match_report->(CASE WHEN v_match_count = 0 THEN 'unmatched' ELSE 'ambiguous' END)) || jsonb_build_array(jsonb_build_object(
          'sheet_name', v_trainee->>'sheet_name',
          'normalized_employee_name', v_trainee->>'normalized_employee_name',
          'match_count', v_match_count,
          'created_unlinked_record', false,
          'reason', 'fallback_location_not_found'
        ))
      );
      CONTINUE;
    END IF;

      SELECT id
      INTO v_record_id
      FROM public.training_records
      WHERE template_id = v_template_id
        AND (
          (v_record_labor_employee_id IS NOT NULL AND labor_employee_id = v_record_labor_employee_id)
          OR (
            v_record_labor_employee_id IS NULL
            AND labor_employee_id IS NULL
            AND regexp_replace(lower(employee_full_name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(v_record_employee_name), '[^a-z0-9]+', '', 'g')
          )
        )
        AND overall_status <> 'archived'
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_record_id IS NULL THEN
        INSERT INTO public.training_records (
          template_id,
          template_version_id,
          template_name_snapshot,
          template_class_snapshot,
          labor_employee_id,
          employee_id,
          employee_name_first,
          employee_name_last,
          employee_full_name,
          target_role,
          location_id,
          hire_date,
          training_start_date,
          assigned_trainer_name,
          assigned_manager_name,
          overall_status,
          progress_percent,
          required_item_count,
          required_item_completed_count,
          template_snapshot,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          v_template_id,
          v_version_id,
          v_seed->'template'->>'name',
          'training_plan',
          v_record_labor_employee_id,
          v_record_labor_employee_id,
          split_part(v_record_employee_name, ' ', 1),
          NULLIF(btrim(substring(v_record_employee_name FROM length(split_part(v_record_employee_name, ' ', 1)) + 1)), ''),
          v_record_employee_name,
          v_record_position_title,
          v_record_location_id,
          v_record_hire_date,
          CURRENT_DATE,
          v_record_trainer_name,
          v_record_manager_name,
          'not_started',
          0,
          v_required_count,
          0,
          COALESCE(public.build_training_template_published_snapshot(v_version_id), '{}'::jsonb),
          NULL,
          NULL
        )
        RETURNING id INTO v_record_id;

        INSERT INTO public.training_record_events (
          record_id,
          event_type,
          actor_name,
          after_state
        )
        VALUES (
          v_record_id,
          'record_created',
          'CSR Workbook Import',
          jsonb_build_object(
            'template_id', v_template_id,
            'template_version_id', v_version_id,
            'source_sheet', v_trainee->>'sheet_name',
            'source_workbook', v_seed->'import_report'->>'source_workbook_name'
          )
        );
      END IF;

      INSERT INTO public.training_record_item_results (
        record_id,
        template_item_id,
        template_section_id,
        status,
        metadata
      )
      SELECT
        v_record_id,
        item.id,
        item.template_section_id,
        'not_started'::public.training_item_status,
        '{}'::jsonb
      FROM public.training_template_items item
      WHERE item.template_version_id = v_version_id
      ON CONFLICT (record_id, template_item_id) DO NOTHING;

      FOR v_result IN SELECT value FROM jsonb_array_elements(v_trainee->'results') LOOP
        SELECT item.id, item.template_section_id
        INTO v_item_id, v_section_id
        FROM public.training_template_items item
        WHERE item.template_version_id = v_version_id
          AND item.item_key = v_result->>'item_key';

        IF v_item_id IS NOT NULL THEN
          UPDATE public.training_record_item_results
          SET
            status = (v_result->>'item_status')::public.training_item_status,
            completed_by_name = CASE
              WHEN (v_result->>'item_status') IN ('complete', 'passed') THEN COALESCE(NULLIF(v_result->>'verified_by', ''), NULLIF(v_result->>'demonstrated_by', ''), completed_by_name)
              ELSE completed_by_name
            END,
            completed_at = CASE
              WHEN (v_result->>'item_status') IN ('complete', 'passed') THEN COALESCE(completed_at, now())
              ELSE completed_at
            END,
            evaluated_by_name = CASE
              WHEN (v_result->>'item_status') <> 'not_started' THEN COALESCE(NULLIF(v_result->>'verified_by', ''), NULLIF(v_result->>'demonstrated_by', ''), evaluated_by_name)
              ELSE evaluated_by_name
            END,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'readiness_status', v_result->>'readiness_status',
              'pct_readiness_status', v_result->>'readiness_status',
              'demonstrated_by_name', NULLIF(v_result->>'demonstrated_by', ''),
              'verified_by_name', NULLIF(v_result->>'verified_by', ''),
              'source_workbook', v_seed->'import_report'->>'source_workbook_name',
              'source_sheet', v_trainee->>'sheet_name',
              'source_row', (v_result->>'source_row')::integer,
              'raw_values', v_result->'raw_values',
              'match_method', v_import_match_method,
              'imported_at', now()
            ),
            updated_at = now()
          WHERE record_id = v_record_id
            AND template_item_id = v_item_id;

          IF NULLIF(v_result->>'note_text', '') IS NOT NULL THEN
            IF NOT EXISTS (
              SELECT 1
              FROM public.training_record_notes note
              WHERE note.record_id = v_record_id
                AND note.template_item_id = v_item_id
                AND note.note_text = v_result->>'note_text'
            ) THEN
              INSERT INTO public.training_record_notes (
                record_id,
                template_section_id,
                template_item_id,
                note_text,
                initials,
                created_by_name
              )
              VALUES (
                v_record_id,
                v_section_id,
                v_item_id,
                v_result->>'note_text',
                'CWI',
                'CSR Workbook Import'
              );
            END IF;
          END IF;
        END IF;
      END LOOP;

      PERFORM public.recalculate_training_readiness_record(v_record_id, NULL);

    v_record_id := NULL;
    v_item_id := NULL;
    v_section_id := NULL;
  END LOOP;

  UPDATE public.training_template_versions
  SET metadata = jsonb_set(
    metadata,
    '{import_report,employee_matching}',
    v_match_report,
    true
  )
  WHERE id = v_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_training_readiness_board(
  p_location_ref text,
  p_template_slug text DEFAULT 'pct_team_readiness_board',
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_id uuid;
  v_template public.training_templates%ROWTYPE;
  v_version public.training_template_versions%ROWTYPE;
  v_sections jsonb := '[]'::jsonb;
  v_records jsonb := '[]'::jsonb;
  v_cells jsonb := '{}'::jsonb;
  v_available_employees jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_template_slug text := COALESCE(NULLIF(trim(p_template_slug), ''), 'pct_team_readiness_board');
  v_empty_summary jsonb := jsonb_build_object(
    'template_slug', COALESCE(NULLIF(trim(p_template_slug), ''), 'pct_team_readiness_board'),
    'total_active_trainees', 0,
    'total_active_pct_trainees', 0,
    'average_demonstrated', 0,
    'average_completion', 0,
    'average_readiness', 0,
    'needs_coaching_count', 0,
    'weakest_task_gaps', '[]'::jsonb
  );
BEGIN
  v_location_id := public.resolve_labor_location_id(p_location_ref, p_actor_user_id);
  IF v_location_id IS NULL THEN
    RETURN jsonb_build_object(
      'template', NULL,
      'sections', '[]'::jsonb,
      'records', '[]'::jsonb,
      'cells', '{}'::jsonb,
      'available_employees', '[]'::jsonb,
      'summary', v_empty_summary,
      'import_report', '{}'::jsonb,
      'error', 'location_not_found'
    );
  END IF;

  SELECT *
  INTO v_template
  FROM public.training_templates
  WHERE slug = v_template_slug
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'template', NULL,
      'sections', '[]'::jsonb,
      'records', '[]'::jsonb,
      'cells', '{}'::jsonb,
      'available_employees', '[]'::jsonb,
      'summary', v_empty_summary,
      'import_report', '{}'::jsonb
    );
  END IF;

  SELECT *
  INTO v_version
  FROM public.training_template_versions
  WHERE template_id = v_template.id
    AND is_current = true
    AND status = 'published'
  ORDER BY version_no DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'template', to_jsonb(v_template),
      'sections', '[]'::jsonb,
      'records', '[]'::jsonb,
      'cells', '{}'::jsonb,
      'available_employees', '[]'::jsonb,
      'summary', v_empty_summary,
      'import_report', '{}'::jsonb,
      'error', 'current_version_not_found'
    );
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', section.id,
      'section_key', section.section_key,
      'title', section.title,
      'sequence_order', section.sequence_order,
      'metadata', section.metadata,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', item.id,
          'item_key', item.item_key,
          'label', item.label,
          'description', item.description,
          'sequence_order', item.sequence_order,
          'required', item.required,
          'metadata', item.metadata
        ) ORDER BY item.sequence_order)
        FROM public.training_template_items item
        WHERE item.template_section_id = section.id
      ), '[]'::jsonb)
    )
    ORDER BY section.sequence_order
  ), '[]'::jsonb)
  INTO v_sections
  FROM public.training_template_sections section
  WHERE section.template_version_id = v_version.id
    AND section.parent_section_id IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', record.id,
      'template_id', record.template_id,
      'template_version_id', record.template_version_id,
      'template_slug', v_template.slug,
      'labor_employee_id', record.labor_employee_id,
      'employee_full_name', record.employee_full_name,
      'target_role', record.target_role,
      'hire_date', record.hire_date,
      'training_start_date', record.training_start_date,
      'target_end_date', record.target_end_date,
      'overall_status', record.overall_status,
      'progress_percent', record.progress_percent,
      'required_item_count', record.required_item_count,
      'required_item_completed_count', record.required_item_completed_count,
      'updated_at', record.updated_at,
      'employee', CASE WHEN employee.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', employee.id,
        'full_name', employee.full_name,
        'position_title', employee.position_title,
        'employment_status', employee.employment_status,
        'start_date', employee.start_date,
        'first_shift_date', employee.first_shift_date,
        'end_date', employee.end_date
      ) END
    )
    ORDER BY COALESCE(employee.start_date, record.training_start_date, record.created_at::date) DESC NULLS LAST, record.employee_full_name
  ), '[]'::jsonb)
  INTO v_records
  FROM public.training_records record
  LEFT JOIN public.labor_employees employee ON employee.id = record.labor_employee_id
  WHERE record.location_id = v_location_id
    AND record.template_id = v_template.id
    AND record.overall_status <> 'archived';

  WITH cell_rows AS (
    SELECT
      result.record_id,
      result.template_item_id,
      result.template_section_id,
      result.status,
      COALESCE(result.metadata->>'readiness_status', result.metadata->>'pct_readiness_status', CASE
        WHEN result.status IN ('complete', 'passed') THEN 'verified'
        WHEN result.status = 'in_progress' THEN 'demonstrated'
        ELSE result.status::text
      END) AS readiness_status,
      result.completed_by_name,
      result.completed_at,
      result.evaluated_by_name,
      result.updated_at,
      result.metadata,
      (
        SELECT note.note_text
        FROM public.training_record_notes note
        WHERE note.record_id = result.record_id
          AND note.template_item_id = result.template_item_id
        ORDER BY note.created_at DESC
        LIMIT 1
      ) AS latest_note,
      (
        SELECT note.created_at
        FROM public.training_record_notes note
        WHERE note.record_id = result.record_id
          AND note.template_item_id = result.template_item_id
        ORDER BY note.created_at DESC
        LIMIT 1
      ) AS latest_note_at
    FROM public.training_record_item_results result
    JOIN public.training_records record ON record.id = result.record_id
    WHERE record.location_id = v_location_id
      AND record.template_id = v_template.id
      AND record.overall_status <> 'archived'
  )
  SELECT COALESCE(jsonb_object_agg(
    record_id::text || ':' || template_item_id::text,
    jsonb_build_object(
      'record_id', record_id,
      'template_item_id', template_item_id,
      'template_section_id', template_section_id,
      'status', status,
      'readiness_status', readiness_status,
      'demonstrated_by', metadata->>'demonstrated_by_name',
      'verified_by', metadata->>'verified_by_name',
      'completed_by_name', completed_by_name,
      'completed_at', completed_at,
      'evaluated_by_name', evaluated_by_name,
      'updated_at', updated_at,
      'latest_note', latest_note,
      'latest_note_at', latest_note_at,
      'metadata', metadata
    )
  ), '{}'::jsonb)
  INTO v_cells
  FROM cell_rows;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', employee.id,
    'full_name', employee.full_name,
    'position_title', employee.position_title,
    'employment_status', employee.employment_status,
    'start_date', employee.start_date,
    'first_shift_date', employee.first_shift_date,
    'assigned_trainer_name', employee.assigned_trainer_name,
    'assigned_manager_name', employee.assigned_manager_name
  ) ORDER BY COALESCE(employee.start_date, employee.first_shift_date) DESC NULLS LAST, employee.full_name), '[]'::jsonb)
  INTO v_available_employees
  FROM public.labor_employees employee
  WHERE employee.location_id = v_location_id
    AND employee.employment_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.template_id = v_template.id
        AND record.labor_employee_id = employee.id
        AND record.overall_status <> 'archived'
    );

  WITH records_for_board AS (
    SELECT record.id
    FROM public.training_records record
    WHERE record.location_id = v_location_id
      AND record.template_id = v_template.id
      AND record.overall_status <> 'archived'
  ), cell_summary AS (
    SELECT
      result.record_id,
      result.template_item_id,
      item.template_section_id,
      item.label,
      item.required,
      section.title AS category,
      COALESCE(result.metadata->>'readiness_status', result.metadata->>'pct_readiness_status', CASE
        WHEN result.status IN ('complete', 'passed') THEN 'verified'
        WHEN result.status = 'in_progress' THEN 'demonstrated'
        ELSE result.status::text
      END) AS readiness_status
    FROM public.training_record_item_results result
    JOIN public.training_records record ON record.id = result.record_id
    JOIN public.training_template_items item ON item.id = result.template_item_id
    JOIN public.training_template_sections section ON section.id = item.template_section_id
    WHERE record.location_id = v_location_id
      AND record.template_id = v_template.id
      AND record.overall_status <> 'archived'
  ), record_progress AS (
    SELECT
      record_id,
      COUNT(*) FILTER (WHERE required = true) AS total_required,
      COUNT(*) FILTER (WHERE required = true AND readiness_status IN ('demonstrated', 'verified', 'waived')) AS demonstrated_count,
      COUNT(*) FILTER (WHERE required = true AND readiness_status IN ('verified', 'waived')) AS completion_count
    FROM cell_summary
    GROUP BY record_id
  ), weak_tasks AS (
    SELECT
      template_item_id,
      label,
      category,
      COUNT(*) FILTER (WHERE readiness_status NOT IN ('verified', 'waived')) AS gap_count,
      COUNT(*) AS trainee_count
    FROM cell_summary
    GROUP BY template_item_id, label, category
    HAVING COUNT(*) FILTER (WHERE readiness_status NOT IN ('verified', 'waived')) > 0
    ORDER BY gap_count DESC, label
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'template_slug', v_template.slug,
    'total_active_trainees', (SELECT COUNT(*) FROM records_for_board),
    'total_active_pct_trainees', CASE WHEN v_template.slug = 'pct_team_readiness_board' THEN (SELECT COUNT(*) FROM records_for_board) ELSE 0 END,
    'average_demonstrated', COALESCE((SELECT ROUND(AVG(CASE WHEN total_required > 0 THEN demonstrated_count::numeric / total_required::numeric * 100 ELSE 0 END), 1) FROM record_progress), 0),
    'average_completion', COALESCE((SELECT ROUND(AVG(CASE WHEN total_required > 0 THEN completion_count::numeric / total_required::numeric * 100 ELSE 0 END), 1) FROM record_progress), 0),
    'average_readiness', COALESCE((SELECT ROUND(AVG(CASE WHEN total_required > 0 THEN completion_count::numeric / total_required::numeric * 100 ELSE 0 END), 1) FROM record_progress), 0),
    'needs_coaching_count', COALESCE((SELECT COUNT(*) FROM cell_summary WHERE readiness_status = 'needs_coaching'), 0),
    'weakest_task_gaps', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'template_item_id', template_item_id,
      'label', label,
      'category', category,
      'gap_count', gap_count,
      'trainee_count', trainee_count
    )) FROM weak_tasks), '[]'::jsonb)
  )
  INTO v_summary;

  RETURN jsonb_build_object(
    'template', to_jsonb(v_template) || jsonb_build_object('current_version', to_jsonb(v_version)),
    'sections', v_sections,
    'records', v_records,
    'cells', v_cells,
    'available_employees', v_available_employees,
    'summary', v_summary,
    'import_report', COALESCE(v_version.metadata->'import_report', '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pct_readiness_board(
  p_location_ref text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.get_training_readiness_board(p_location_ref, 'pct_team_readiness_board', p_actor_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_training_readiness_record(
  p_labor_employee_id uuid,
  p_location_ref text,
  p_template_slug text DEFAULT 'pct_team_readiness_board',
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.training_records
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_id uuid;
  v_employee public.labor_employees%ROWTYPE;
  v_template public.training_templates%ROWTYPE;
  v_existing_id uuid;
  v_record public.training_records%ROWTYPE;
BEGIN
  IF p_labor_employee_id IS NULL THEN
    RAISE EXCEPTION 'Labor employee is required';
  END IF;

  v_location_id := public.resolve_labor_location_id(p_location_ref, p_actor_user_id);
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve location from %', p_location_ref;
  END IF;

  SELECT *
  INTO v_employee
  FROM public.labor_employees
  WHERE id = p_labor_employee_id
    AND location_id = v_location_id
    AND employment_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active labor employee % was not found for location %', p_labor_employee_id, v_location_id;
  END IF;

  SELECT *
  INTO v_template
  FROM public.training_templates
  WHERE slug = COALESCE(NULLIF(trim(p_template_slug), ''), 'pct_team_readiness_board')
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Readiness template % is not installed', p_template_slug;
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.training_records
  WHERE template_id = v_template.id
    AND labor_employee_id = v_employee.id
    AND overall_status <> 'archived'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Active readiness record already exists for % on %', v_employee.full_name, v_template.name;
  END IF;

  SELECT *
  INTO v_record
  FROM public.create_training_record(
    v_template.id,
    v_location_id::text,
    v_employee.full_name,
    COALESCE(NULLIF(v_employee.position_title, ''), CASE WHEN v_template.slug = 'csr_team_readiness_board' THEN 'CSR' ELSE 'PCT' END),
    COALESCE(v_employee.first_shift_date, v_employee.start_date),
    CURRENT_DATE,
    NULL,
    v_employee.assigned_trainer_name,
    p_actor_user_id,
    p_actor_name,
    v_employee.assigned_manager_name,
    v_employee.id
  );

  UPDATE public.training_record_item_results result
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('readiness_status', 'not_started', 'pct_readiness_status', 'not_started')
  WHERE result.record_id = v_record.id;

  RETURN public.recalculate_training_readiness_record(v_record.id, p_actor_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_pct_readiness_record(
  p_labor_employee_id uuid,
  p_location_ref text,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.training_records
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.create_training_readiness_record(p_labor_employee_id, p_location_ref, 'pct_team_readiness_board', p_actor_user_id, p_actor_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_training_readiness_cell(
  p_record_id uuid,
  p_template_item_id uuid,
  p_readiness_status text,
  p_demonstrated_by text DEFAULT NULL,
  p_verified_by text DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_record public.training_records%ROWTYPE;
  v_result public.training_record_item_results%ROWTYPE;
  v_before jsonb;
  v_readiness_status text := lower(regexp_replace(trim(COALESCE(p_readiness_status, 'not_started')), '[^a-z0-9]+', '_', 'g'));
  v_item_status public.training_item_status;
  v_actor_user_id uuid := COALESCE(auth.uid(), p_actor_user_id);
  v_actor_name text;
  v_note_text text := NULLIF(trim(COALESCE(p_comment, '')), '');
  v_updated_record public.training_records%ROWTYPE;
  v_actor_metadata jsonb;
BEGIN
  IF v_readiness_status IN ('verified', 'qualified', 'verified_qualified') THEN
    v_readiness_status := 'verified';
    v_item_status := 'complete';
  ELSIF v_readiness_status = 'demonstrated' THEN
    v_item_status := 'in_progress';
  ELSIF v_readiness_status = 'needs_coaching' THEN
    v_item_status := 'needs_coaching';
  ELSIF v_readiness_status = 'blocked' THEN
    v_item_status := 'blocked';
  ELSIF v_readiness_status = 'waived' THEN
    v_item_status := 'waived';
  ELSIF v_readiness_status = 'not_started' THEN
    v_item_status := 'not_started';
  ELSE
    RAISE EXCEPTION 'Unsupported readiness status %', p_readiness_status;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.training_records record
  JOIN public.training_templates template ON template.id = record.template_id
  WHERE record.id = p_record_id
    AND template.slug LIKE '%_team_readiness_board'
    AND record.overall_status <> 'archived';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Readiness record % was not found', p_record_id;
  END IF;

  SELECT COALESCE(NULLIF(trim(lp.full_name), ''), NULLIF(trim(lp.email), ''))
  INTO v_actor_name
  FROM public.lite_profiles lp
  LEFT JOIN public.locations loc ON loc.slug = lp.location_id
  WHERE lp.user_id = v_actor_user_id
    AND lp.is_active = true
    AND (
      loc.id = v_record.location_id
      OR lp.role = 'enterprise_admin'
    )
  ORDER BY CASE WHEN loc.id = v_record.location_id THEN 0 ELSE 1 END, lp.updated_at DESC
  LIMIT 1;

  v_actor_name := COALESCE(v_actor_name, auth.jwt() ->> 'email', NULLIF(trim(COALESCE(p_actor_name, '')), ''), 'System');
  v_actor_metadata := jsonb_build_object(
    'last_updated_by_name', v_actor_name,
    'last_updated_by_user_id', v_actor_user_id,
    'last_updated_at', now(),
    'attribution_source', 'authenticated_actor'
  );

  SELECT *
  INTO v_result
  FROM public.training_record_item_results
  WHERE record_id = p_record_id
    AND template_item_id = p_template_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Readiness item % was not found for record %', p_template_item_id, p_record_id;
  END IF;

  v_before := to_jsonb(v_result);

  IF v_readiness_status = 'demonstrated' THEN
    v_actor_metadata := v_actor_metadata || jsonb_build_object(
      'demonstrated_by_name', v_actor_name,
      'demonstrated_by_user_id', v_actor_user_id
    );
  ELSIF v_readiness_status IN ('verified', 'waived') THEN
    v_actor_metadata := v_actor_metadata || jsonb_build_object(
      'verified_by_name', v_actor_name,
      'verified_by_user_id', v_actor_user_id
    );
  END IF;

  UPDATE public.training_record_item_results
  SET
    status = v_item_status,
    completed_by_user_id = CASE WHEN v_item_status IN ('complete', 'passed', 'waived') THEN v_actor_user_id ELSE NULL END,
    completed_by_name = CASE WHEN v_item_status IN ('complete', 'passed', 'waived') THEN v_actor_name ELSE NULL END,
    completed_at = CASE WHEN v_item_status IN ('complete', 'passed', 'waived') THEN COALESCE(completed_at, now()) ELSE NULL END,
    evaluated_by_user_id = CASE WHEN v_item_status <> 'not_started' THEN v_actor_user_id ELSE NULL END,
    evaluated_by_name = CASE WHEN v_item_status <> 'not_started' THEN v_actor_name ELSE NULL END,
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('readiness_status', v_readiness_status, 'pct_readiness_status', v_readiness_status)
      || v_actor_metadata,
    updated_at = now()
  WHERE id = v_result.id
  RETURNING * INTO v_result;

  IF v_note_text IS NOT NULL THEN
    INSERT INTO public.training_record_notes (
      record_id,
      template_section_id,
      template_item_id,
      note_text,
      initials,
      created_by_user_id,
      created_by_name
    )
    VALUES (
      p_record_id,
      v_result.template_section_id,
      p_template_item_id,
      v_note_text,
      public.labor_initials(v_actor_name),
      v_actor_user_id,
      v_actor_name
    );
  END IF;

  v_updated_record := public.recalculate_training_readiness_record(p_record_id, v_actor_user_id);

  INSERT INTO public.training_record_events (
    record_id,
    template_item_id,
    event_type,
    actor_user_id,
    actor_name,
    before_state,
    after_state
  )
  VALUES (
    p_record_id,
    p_template_item_id,
    'item_status_changed',
    v_actor_user_id,
    v_actor_name,
    v_before,
    to_jsonb(v_result)
  );

  RETURN jsonb_build_object(
    'result', to_jsonb(v_result),
    'record', to_jsonb(v_updated_record)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pct_readiness_cell(
  p_record_id uuid,
  p_template_item_id uuid,
  p_readiness_status text,
  p_demonstrated_by text DEFAULT NULL,
  p_verified_by text DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.update_training_readiness_cell(
    p_record_id,
    p_template_item_id,
    p_readiness_status,
    p_demonstrated_by,
    p_verified_by,
    p_comment,
    p_actor_user_id,
    p_actor_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_training_readiness_record(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_pct_readiness_record(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_readiness_board(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pct_readiness_board(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_training_readiness_record(uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pct_readiness_record(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_training_readiness_cell(uuid, uuid, text, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_pct_readiness_cell(uuid, uuid, text, text, text, text, uuid, text) TO authenticated;
