package earth.saysheep.wifidirect;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pDeviceList;
import android.net.wifi.p2p.WifiP2pInfo;
import android.net.wifi.p2p.WifiP2pManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Collection;

@CapacitorPlugin(
    name = "WifiDirect",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.ACCESS_WIFI_STATE, Manifest.permission.CHANGE_WIFI_STATE }, alias = "wifi"),
        @Permission(strings = { "android.permission.NEARBY_WIFI_DEVICES" }, alias = "nearby"),
    }
)
public class WifiDirectPlugin extends Plugin {

    private WifiP2pManager manager;
    private WifiP2pManager.Channel channel;
    private WifiDirectManager directManager;
    private BroadcastReceiver receiver;
    private IntentFilter intentFilter;

    @Override
    public void load() {
        manager = (WifiP2pManager) getContext().getSystemService(Context.WIFI_P2P_SERVICE);
        channel = manager.initialize(getContext(), getActivity().getMainLooper(), null);
        directManager = new WifiDirectManager(manager, channel, this);

        intentFilter = new IntentFilter();
        intentFilter.addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION);
        intentFilter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
        intentFilter.addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
        intentFilter.addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION);

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                directManager.handleBroadcast(intent);
            }
        };
    }

    @Override
    protected void handleOnResume() {
        getContext().registerReceiver(receiver, intentFilter);
    }

    @Override
    protected void handleOnPause() {
        getContext().unregisterReceiver(receiver);
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+: NEARBY_WIFI_DEVICES replaces location for peer discovery
            if (!hasPermission("nearby")) {
                requestPermissionForAlias("nearby", call, "nearbyPermissionCallback");
                return;
            }
        } else {
            if (!hasPermission("location")) {
                requestPermissionForAlias("location", call, "locationPermissionCallback");
                return;
            }
        }
        directManager.startDiscovery(call);
    }

    @PermissionCallback
    private void nearbyPermissionCallback(PluginCall call) {
        if (hasPermission("nearby")) {
            directManager.startDiscovery(call);
        } else {
            call.reject("Nearby WiFi Devices permission denied");
        }
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        if (hasPermission("location")) {
            directManager.startDiscovery(call);
        } else {
            call.reject("Location permission denied (required for WiFi Direct on Android < 13)");
        }
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        directManager.stopDiscovery(call);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null) { call.reject("address required"); return; }
        directManager.connect(address, call);
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        directManager.disconnect(call);
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String message = call.getString("message");
        if (message == null) { call.reject("message required"); return; }
        directManager.sendMessage(message, call);
    }

    @PluginMethod
    public void getConnectionInfo(PluginCall call) {
        directManager.getConnectionInfo(call);
    }

    // Called by WifiDirectManager to push events to JS
    public void emitPeerFound(WifiP2pDevice device) {
        JSObject data = new JSObject();
        data.put("name", device.deviceName);
        data.put("address", device.deviceAddress);
        data.put("status", deviceStatusString(device.status));
        notifyListeners("peerFound", data);
    }

    public void emitPeersUpdated(Collection<WifiP2pDevice> peers) {
        JSArray arr = new JSArray();
        for (WifiP2pDevice d : peers) {
            JSObject obj = new JSObject();
            obj.put("name", d.deviceName);
            obj.put("address", d.deviceAddress);
            obj.put("status", deviceStatusString(d.status));
            arr.put(obj);
        }
        JSObject data = new JSObject();
        data.put("peers", arr);
        notifyListeners("peersUpdated", data);
    }

    public void emitConnectionChanged(boolean connected, String groupOwnerAddress, boolean isGroupOwner) {
        JSObject data = new JSObject();
        data.put("connected", connected);
        data.put("groupOwnerAddress", groupOwnerAddress);
        data.put("isGroupOwner", isGroupOwner);
        notifyListeners("connectionChanged", data);
    }

    public void emitMessageReceived(String message, String fromAddress) {
        JSObject data = new JSObject();
        data.put("message", message);
        data.put("from", fromAddress);
        notifyListeners("messageReceived", data);
    }

    private static String deviceStatusString(int status) {
        switch (status) {
            case WifiP2pDevice.AVAILABLE: return "available";
            case WifiP2pDevice.CONNECTED: return "connected";
            case WifiP2pDevice.FAILED: return "failed";
            case WifiP2pDevice.INVITED: return "invited";
            case WifiP2pDevice.UNAVAILABLE: return "unavailable";
            default: return "unknown";
        }
    }
}
