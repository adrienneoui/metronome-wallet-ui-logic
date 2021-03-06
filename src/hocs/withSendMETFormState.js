import { getInitialState } from './withGasEditorState'
import * as validators from '../validators'
import { withClient } from './clientContext'
import * as selectors from '../selectors'
import { connect } from 'react-redux'
import * as utils from '../utils'
import PropTypes from 'prop-types'
import debounce from 'lodash/debounce'
import React from 'react'

const withSendMETFormState = WrappedComponent => {
  class Container extends React.Component {
    static propTypes = {
      availableMET: PropTypes.string.isRequired,
      client: PropTypes.shape({
        getTokensGasLimit: PropTypes.func.isRequired,
        isAddress: PropTypes.func.isRequired,
        sendMet: PropTypes.func.isRequired,
        fromWei: PropTypes.func.isRequired,
        toWei: PropTypes.func.isRequired
      }).isRequired,
      config: PropTypes.shape({
        MET_DEFAULT_GAS_LIMIT: PropTypes.string.isRequired,
        DEFAULT_GAS_PRICE: PropTypes.string.isRequired,
        MTN_TOKEN_ADDR: PropTypes.string.isRequired
      }).isRequired,
      from: PropTypes.string.isRequired
    }

    static displayName = `withSendMETFormState(${WrappedComponent.displayName ||
      WrappedComponent.name})`

    initialState = {
      ...getInitialState('MET', this.props.client, this.props.config),
      gasEstimateError: false,
      toAddress: null,
      metAmount: null,
      errors: {}
    }

    state = this.initialState

    resetForm = () => this.setState(this.initialState)

    onInputChange = ({ id, value }) => {
      this.setState(state => ({
        ...state,
        gasEstimateError: id === 'gasLimit' ? false : state.gasEstimateError,
        errors: { ...state.errors, [id]: null },
        [id]: utils.sanitizeInput(value)
      }))

      // Estimate gas limit again if parameters changed
      if (['toAddress', 'metAmount'].includes(id)) this.getGasEstimate()
    }

    getGasEstimate = debounce(() => {
      const { metAmount, toAddress } = this.state

      if (
        !this.props.client.isAddress(toAddress) ||
        !utils.isWeiable(this.props.client, metAmount)
      ) {
        return
      }

      this.props.client
        .getTokensGasLimit({
          value: this.props.client.toWei(utils.sanitize(metAmount)),
          token: this.props.config.MTN_TOKEN_ADDR,
          from: this.props.from,
          to: toAddress
        })
        .then(({ gasLimit }) =>
          this.setState({
            gasEstimateError: false,
            gasLimit: gasLimit.toString()
          })
        )
        .catch(() => this.setState({ gasEstimateError: true }))
    }, 500)

    onSubmit = password =>
      this.props.client.sendMet({
        gasPrice: this.props.client.toWei(this.state.gasPrice, 'gwei'),
        gas: this.state.gasLimit,
        password,
        value: this.props.client.toWei(utils.sanitize(this.state.metAmount)),
        from: this.props.from,
        to: this.state.toAddress
      })

    validate = () => {
      const { metAmount, toAddress, gasPrice, gasLimit } = this.state
      const { client } = this.props
      const max = client.fromWei(this.props.availableMET)
      const errors = {
        ...validators.validateToAddress(client, toAddress),
        ...validators.validateMetAmount(client, metAmount, max),
        ...validators.validateGasPrice(client, gasPrice),
        ...validators.validateGasLimit(client, gasLimit)
      }
      const hasErrors = Object.keys(errors).length > 0
      if (hasErrors) this.setState({ errors })
      return !hasErrors
    }

    onMaxClick = () => {
      const metAmount = this.props.client.fromWei(this.props.availableMET)
      this.onInputChange({ id: 'metAmount', value: metAmount })
    }

    render() {
      const amountFieldsProps = utils.getAmountFieldsProps({
        metAmount: this.state.metAmount
      })

      return (
        <WrappedComponent
          onInputChange={this.onInputChange}
          onMaxClick={this.onMaxClick}
          resetForm={this.resetForm}
          onSubmit={this.onSubmit}
          {...this.props}
          {...this.state}
          metPlaceholder={amountFieldsProps.metPlaceholder}
          metAmount={amountFieldsProps.metAmount}
          validate={this.validate}
        />
      )
    }
  }

  const mapStateToProps = state => ({
    availableMET: selectors.getMtnBalanceWei(state),
    config: selectors.getConfig(state),
    from: selectors.getActiveAddress(state)
  })

  return connect(mapStateToProps)(withClient(Container))
}

export default withSendMETFormState
