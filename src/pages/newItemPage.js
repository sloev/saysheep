import van from "vanjs-core"
import * as vanX from "vanjs-ext"

import { getStore, createNewItem, addWarning } from '../store.js'
import cameraImage from '../images/camera.png'
import LocationImage from '../images/location.png'
import { cone } from '../router.js'

const { a, button, canvas, div, h3, img, input, label, li, nav, p, textarea, ul, video } = van.tags

const store = getStore()
window.store = store;
const cameraIsOn = van.state(false)
const hasPhoto = van.state(false)
const photo = van.state(null)
const title = van.state("")
const description = van.state("")

const videoElement = video({ class: "preview", id: "camera" }, "allow camera!")
const previewElement = canvas({ class: "preview" })


const startCamera = () => {
    if (cameraIsOn.val) {
        return
    }
    console.log("start camera")
    cameraIsOn.val = true
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment'
        },
        audio: false
    })
        .then(function (stream) {
            videoElement.srcObject = stream;
            videoElement.play();
            hasPhoto.val = false
            photo.val = null
        })
        .catch(function (err) {
            addWarning("Didn't get camera feed!")
            console.log("An error occurred during camera operation: " + err);
        });
}
const stopCamera = () => {
    console.log("stop camera")
    videoElement.pause()
    const stream = videoElement.srcObject;
    stream.getTracks()[0].stop()
    videoElement.src = "";
    cameraIsOn.val = false
    videoElement.load()
}
const clearImage = () => {
    startCamera()
}

const takePhoto = () => {
    previewElement.width = videoElement.videoWidth;
    previewElement.height = videoElement.videoHeight;
    var context = previewElement.getContext("2d");
    context.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);
    hasPhoto.val = true;
    videoElement.pause()
    const stream = videoElement.srcObject;
    stream.getTracks()[0].stop()
    videoElement.src = "";
    photo.val = previewElement.toDataURL('image/jpg');

}

const createNewItem = async () => {
    try {
        const data = await createNewItem({ photo: photo.val, title: title.val, description: description.val })
        console.log(data)
        cone.navigate("map", {})
    } catch (e) {
        console.log("error", e)
    }
}


export const NewItemPage = () => {
    van.derive(() => {
        if (cone.isCurrentPage("new") && !cameraIsOn.val) {
            startCamera()
        }
        if (!cone.isCurrentPage("new") && cameraIsOn.val) {
            stopCamera()
        }
    })

    return div({ class: "content" },

        div({ class: "new-item-form" },
            div({ class: () => hasPhoto.val ? "preview-container" : "preview-container visible" },
                videoElement),
            div({ class: () => hasPhoto.val ? "preview-container visible" : "preview-container" },
                previewElement),
            () => hasPhoto.val ?
                button({ class: "trigger", onclick: () => clearImage() }, "clear") :
                button({ disabled: () => !store.hasPosition, class: "trigger", onclick: () => takePhoto() }, store.hasPosition ? img({ src: cameraImage }) : "... waiting for gps position"),

            div({ class: "new-item-field-container" },
                input({
                    class: "new-item-field",
                    type: "text",
                    placeholder: "title", value: title,
                    oninput: e => title.val = e.target.value
                })),
            div({ class: "new-item-field-container" },
                textarea({
                    class: "new-item-field",
                    placeholder: "description",
                    required: "True",
                    value: description, maxlength: "300",
                    oninput: e => description.val = e.target.value
                })),

            div({ class: "new-item-field-container" },
                button({
                    disabled: () => title.val.length < 1 || description.val.length < 1 ||
                        !hasPhoto.val || !store.hasPosition,
                    class: "new-item-field",
                    onclick: createNewItem
                }, "Create"))


        )
    )

}
