import dagster
from dagster import check
from dagster import config
from dagster.core.definitions import (
    Solid, create_single_source_input, create_no_materialization_output
)
from dagster.transform_only_solid import (dep_only_input, no_args_transform_solid)


def _set_key_value(ddict, key, value):
    ddict[key] = value
    return value


def test_execute_solid_with_dep_only_inputs_no_api():
    did_run_dict = {}

    step_one_solid = Solid(
        name='step_one_solid',
        inputs=[],
        transform_fn=lambda: _set_key_value(did_run_dict, 'step_one', True),
        output=create_no_materialization_output(),
    )

    only_dep_input = create_single_source_input(
        name='step_one_solid',
        source_fn=lambda arg_dict: check.not_implemented('should not get here'),
        argument_def_dict={},
        depends_on=step_one_solid
    )

    step_two_solid = Solid(
        name='step_two_solid',
        inputs=[only_dep_input],
        transform_fn=lambda **kwargs: _set_key_value(did_run_dict, 'step_two', True),
        output=create_no_materialization_output(),
    )

    pipeline = dagster.pipeline(solids=[step_one_solid, step_two_solid])

    # from dagster.utils import logging

    pipeline_result = dagster.execute_pipeline(
        dagster.context(), pipeline, environment=config.Environment.empty()
    )

    assert pipeline_result.success

    for result in pipeline_result.result_list:
        assert result.success

    assert did_run_dict['step_one'] is True
    assert did_run_dict['step_two'] is True


def test_execute_solid_with_dep_only_inputs_with_api():
    did_run_dict = {}

    step_one_solid = no_args_transform_solid(
        name='step_one_solid',
        no_args_transform_fn=lambda: _set_key_value(did_run_dict, 'step_one', True),
    )

    step_two_solid = no_args_transform_solid(
        name='step_two_solid',
        no_args_transform_fn=lambda: _set_key_value(did_run_dict, 'step_two', True),
        inputs=[dep_only_input(step_one_solid)],
    )

    pipeline = dagster.pipeline(solids=[step_one_solid, step_two_solid])

    pipeline_result = dagster.execute_pipeline(
        dagster.context(), pipeline, environment=config.Environment.empty()
    )

    for result in pipeline_result.result_list:
        assert result.success

    assert did_run_dict['step_one'] is True
    assert did_run_dict['step_two'] is True
