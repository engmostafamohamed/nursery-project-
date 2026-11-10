-- A class's nanny (مربية): the carer who looks after the children beside the teachers (feeding,
-- changing, naps). She is on the class team like an assistant, but she is not a teacher on duty:
-- class_duty_teachers keeps counting only the lead, the assistants and the backup, so daily reports,
-- medicine rounds and cover reminders do not go to her.
--
-- On its own: a new enum value cannot be used in the transaction that adds it.

alter type public.class_staff_role add value if not exists 'nanny' after 'assistant';
